'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface AttendanceEngineer {
  id: string
  name: string
}

export interface AttendanceJob {
  workOrderId: string
  customerName: string
  location: string | null
  woNumber: string
  status: string
}

// engineerId -> 'YYYY-MM-DD' -> jobs scheduled/visited that day (usually one, but an
// engineer can have more than one job on the same date, or the same job can appear on
// more than one date if it spanned multiple visits — see the "revisited days" note
// below).
export type AttendanceCells = Record<string, Record<string, AttendanceJob[]>>

// from/to are 'YYYY-MM-DD', inclusive on both ends — the caller (the This
// Week / This Month / Custom filter on the Attendance page) works out the
// actual range; this just builds the grid for whatever range it's given.
export async function getAttendanceGrid(from: string, to: string): Promise<{
  engineers: AttendanceEngineer[]
  dates: string[]
  cells: AttendanceCells
  error: string | null
}> {
  try {
    const admin = adminClient()

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'Field Engineer')
      .order('first_name')
    if (profErr) return { engineers: [], dates: [], cells: {}, error: profErr.message }

    const engineers: AttendanceEngineer[] = (profiles || []).map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }))

    const todayStr = new Date().toLocaleDateString('en-CA')

    const dates: string[] = []
    const cursor = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T00:00:00`)
    while (cursor <= end) {
      dates.push(cursor.toLocaleDateString('en-CA'))
      cursor.setDate(cursor.getDate() + 1)
    }

    if (!engineers.length) return { engineers, dates, cells: {}, error: null }

    const engineerIds = engineers.map(e => e.id)
    const WO_SELECT = 'id, engineer_id, scheduled_date, customer_id, wo_number, status, work_order_transformers(transformers(customer_sites(site_address, place_label)))'

    // A job's scheduled_date now doubles as its follow-up date once marked pending
    // (see submitDailyClosure) — so a job visited on day 1 and pushed to day 5 would
    // otherwise vanish from day 1's cell entirely once its scheduled_date moves. Also
    // pull in any work order with a check-in in this range, regardless of its current
    // scheduled_date, so the day it actually happened still shows up.
    const [{ data: wosByScheduledDate }, { data: checkinsInRange }] = await Promise.all([
      admin.from('work_orders').select(WO_SELECT).in('engineer_id', engineerIds).gte('scheduled_date', from).lte('scheduled_date', to),
      admin.from('work_order_checkins').select('work_order_id, engineer_id, checked_in_at').in('engineer_id', engineerIds).gte('checked_in_at', `${from}T00:00:00`).lte('checked_in_at', `${to}T23:59:59`),
    ])

    type WotRow = { transformers: { customer_sites: { site_address: string; place_label: string | null } | null } | null }
    type Row = {
      id: string; engineer_id: string | null; scheduled_date: string | null; customer_id: string
      wo_number: string; status: string; work_order_transformers: WotRow[]
    }

    const woMap = new Map<string, Row>()
    ;((wosByScheduledDate as unknown as Row[]) || []).forEach(w => woMap.set(w.id, w))

    const extraWoIds = [...new Set((checkinsInRange || []).map(c => c.work_order_id))].filter(id => !woMap.has(id))
    if (extraWoIds.length) {
      const { data: extraWos } = await admin.from('work_orders').select(WO_SELECT).in('id', extraWoIds)
      ;((extraWos as unknown as Row[]) || []).forEach(w => woMap.set(w.id, w))
    }

    const wos = [...woMap.values()]
    const customerIds = [...new Set(wos.map(w => w.customer_id).filter(Boolean))]
    const workOrderIds = wos.map(w => w.id)

    const [{ data: customers }, { data: closures }, { data: checkins }] = await Promise.all([
      customerIds.length
        ? admin.from('customers').select('id, name').in('id', customerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      workOrderIds.length
        ? admin.from('work_order_daily_closures').select('work_order_id, outcome, needs_reassignment, created_at').in('work_order_id', workOrderIds)
        : Promise.resolve({ data: [] as { work_order_id: string; outcome: string; needs_reassignment: boolean; created_at: string }[] }),
      workOrderIds.length
        ? admin.from('work_order_checkins').select('work_order_id, checked_in_at').in('work_order_id', workOrderIds)
        : Promise.resolve({ data: [] as { work_order_id: string; checked_in_at: string }[] }),
    ])

    const custMap: Record<string, string> = {}
    customers?.forEach(c => { custMap[c.id] = c.name })

    // work_order_id -> 'YYYY-MM-DD' -> outcome status, for reconstructing what
    // actually happened on a past date rather than showing today's live status.
    const closuresByWoDate: Record<string, Record<string, string>> = {}
    for (const c of closures || []) {
      const day = new Date(c.created_at).toLocaleDateString('en-CA')
      if (!closuresByWoDate[c.work_order_id]) closuresByWoDate[c.work_order_id] = {}
      closuresByWoDate[c.work_order_id][day] = c.needs_reassignment ? 'needs_reassignment' : c.outcome
    }
    const checkinDaysByWo: Record<string, Set<string>> = {}
    for (const c of checkins || []) {
      const day = new Date(c.checked_in_at).toLocaleDateString('en-CA')
      if (!checkinDaysByWo[c.work_order_id]) checkinDaysByWo[c.work_order_id] = new Set()
      checkinDaysByWo[c.work_order_id].add(day)
    }

    function reconstructStatus(w: Row, day: string): string {
      if (day >= todayStr || w.status === 'completed') return w.status
      const closureOutcome = closuresByWoDate[w.id]?.[day]
      if (closureOutcome) return closureOutcome
      if (checkinDaysByWo[w.id]?.has(day)) return 'in_progress'
      return 'not_started'
    }

    const cells: AttendanceCells = {}
    function pushCell(w: Row, day: string) {
      if (!w.engineer_id) return
      if (!cells[w.engineer_id]) cells[w.engineer_id] = {}
      if (!cells[w.engineer_id][day]) cells[w.engineer_id][day] = []

      const site = w.work_order_transformers?.[0]?.transformers?.customer_sites
      cells[w.engineer_id][day].push({
        workOrderId: w.id,
        customerName: custMap[w.customer_id] || 'Unknown customer',
        location: site?.place_label || site?.site_address || null,
        woNumber: w.wo_number,
        status: reconstructStatus(w, day),
      })
    }

    for (const w of wos) {
      // Current/latest relevant date (original assignment, or the follow-up date once
      // rescheduled) — shows what actually happened that day if it's in the past.
      if (w.scheduled_date && w.scheduled_date >= from && w.scheduled_date <= to) {
        pushCell(w, w.scheduled_date)
      }
      // Any other day within range this job was actually visited (checked in) — a
      // day that's since been superseded by a later scheduled/follow-up date would
      // otherwise disappear from the grid entirely.
      for (const day of checkinDaysByWo[w.id] || []) {
        if (day === w.scheduled_date) continue
        if (day < from || day > to) continue
        pushCell(w, day)
      }
    }

    return { engineers, dates, cells, error: null }
  } catch (e: unknown) {
    return { engineers: [], dates: [], cells: {}, error: e instanceof Error ? e.message : String(e) }
  }
}
