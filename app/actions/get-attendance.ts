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

// engineerId -> 'YYYY-MM-DD' -> jobs scheduled that day (usually one, but an
// engineer can have more than one job on the same date).
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
    const { data: wos } = await admin
      .from('work_orders')
      .select('id, engineer_id, scheduled_date, customer_id, wo_number, status, work_order_transformers(transformers(customer_sites(site_address, place_label)))')
      .in('engineer_id', engineerIds)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)

    const customerIds = [...new Set((wos || []).map(w => w.customer_id).filter(Boolean))]
    const workOrderIds = (wos || []).map(w => w.id)

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

    type WotRow = { transformers: { customer_sites: { site_address: string; place_label: string | null } | null } | null }
    type Row = {
      id: string; engineer_id: string | null; scheduled_date: string | null; customer_id: string
      wo_number: string; status: string; work_order_transformers: WotRow[]
    }

    const cells: AttendanceCells = {}
    for (const w of (wos as unknown as Row[]) || []) {
      if (!w.engineer_id || !w.scheduled_date) continue
      if (!cells[w.engineer_id]) cells[w.engineer_id] = {}
      if (!cells[w.engineer_id][w.scheduled_date]) cells[w.engineer_id][w.scheduled_date] = []

      const site = w.work_order_transformers?.[0]?.transformers?.customer_sites
      const location = site?.place_label || site?.site_address || null

      // For a date that's already passed, show what actually happened that day
      // (closure outcome, or "checked in but not closed", or "nothing recorded")
      // instead of the work order's current live status, which may since have
      // moved on to a new cycle with a different scheduled_date.
      let status = w.status
      if (w.scheduled_date < todayStr && w.status !== 'completed') {
        const closureOutcome = closuresByWoDate[w.id]?.[w.scheduled_date]
        if (closureOutcome) {
          status = closureOutcome
        } else if (checkinDaysByWo[w.id]?.has(w.scheduled_date)) {
          status = 'in_progress'
        } else {
          status = 'not_started'
        }
      }

      cells[w.engineer_id][w.scheduled_date].push({
        workOrderId: w.id,
        customerName: custMap[w.customer_id] || 'Unknown customer',
        location,
        woNumber: w.wo_number,
        status,
      })
    }

    return { engineers, dates, cells, error: null }
  } catch (e: unknown) {
    return { engineers: [], dates: [], cells: {}, error: e instanceof Error ? e.message : String(e) }
  }
}
