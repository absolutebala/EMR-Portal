'use server'

import { adminClient } from '@/lib/db/admin-client'
import { computeEffectiveStatus, getISTDateStr, resolveApprovedByNames, type AttendanceEffectiveStatus, type AttendanceRowCore } from '@/lib/mobile/core/attendance'

export interface AttendanceOverviewJob {
  workOrderId: string
  woNumber: string
  // The transformer's site name (first linked transformer) — matches the Work
  // Order detail page's "Project" field convention, not the Field Engineers
  // page's customer-company-name convention.
  projectName: string | null
  // All linked transformers' serial numbers, comma-joined — a work order can
  // cover more than one.
  serialNumbers: string
  endUserType: string | null // 'Utility' | 'Industry', from customers.customer_type
  state:
    | { kind: 'assigned' } // future date, not yet due
    | { kind: 'no_show' } // due (today or past), no check-in that day
    | { kind: 'in_progress'; checkedInAt: string; followUpDate: string | null; needsReassignment: boolean }
    | { kind: 'completed'; checkedInAt: string; completedAt: string }
}

export interface AttendanceOverviewRow {
  engineerId: string
  engineerName: string
  date: string
  attendance: AttendanceEffectiveStatus
  // Raw timestamp of whatever attendance row exists for this engineer/date (if
  // any) — kept alongside the computed `attendance` status so the UI can show a
  // real time for both Present and explicit Leave without re-deriving it per kind.
  markedAt: string | null
  // Location captured when marking/requesting attendance — separate from
  // endDayPlaceName below, which is captured on End Day instead.
  placeName: string | null
  // End-of-day sign-off — separate from the app's own Sign Out. Null until the
  // engineer taps "End Day" (only available once Present is marked, today only).
  endDayAt: string | null
  endDayPlaceName: string | null
  // The raw attendance row's own id, null when no row exists for this date — used
  // to target the approve/reject action directly from the grid cell.
  attendanceId: string | null
  jobs: AttendanceOverviewJob[]
}

function eachDateStr(fromStr: string, toStr: string): string[] {
  const dates: string[] = []
  for (let d = new Date(`${fromStr}T00:00:00Z`); d <= new Date(`${toStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// from/to are 'YYYY-MM-DD', inclusive on both ends — the caller (the This
// Week / This Month / Custom filter on the Attendance page) works out the
// actual range; this just builds the rows for whatever range it's given.
export async function getAttendanceOverview(from: string, to: string): Promise<{
  rows: AttendanceOverviewRow[]
  error: string | null
}> {
  try {
    const admin = adminClient()

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, first_name, last_name, created_at')
      .eq('role', 'Field Engineer')
      .order('first_name')
    if (profErr) return { rows: [], error: profErr.message }

    const engineers = (profiles || []).map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, createdAt: p.created_at as string | null }))
    if (!engineers.length) return { rows: [], error: null }

    const todayStr = getISTDateStr()
    const dates = eachDateStr(from, to)
    const engineerIds = engineers.map(e => e.id)

    const WO_SELECT = 'id, engineer_id, scheduled_date, customer_id, wo_number, status, work_order_transformers(transformers(serial_number, customer_sites(site_name)))'

    // A job's scheduled_date doubles as its follow-up date once marked pending (see
    // submitDailyClosure) — so a job visited on day 1 and pushed to day 5 would
    // otherwise vanish from day 1 entirely once its scheduled_date moves. Also pull
    // in any work order with a check-in in this range regardless of its current
    // scheduled_date, so the day it actually happened still shows up.
    const [{ data: wosByScheduledDate }, { data: checkinsInRange }] = await Promise.all([
      admin.from('work_orders').select(WO_SELECT).in('engineer_id', engineerIds).gte('scheduled_date', from).lte('scheduled_date', to),
      admin.from('work_order_checkins').select('work_order_id, engineer_id, checked_in_at').in('engineer_id', engineerIds).gte('checked_in_at', `${from}T00:00:00`).lte('checked_in_at', `${to}T23:59:59`),
    ])

    type WotRow = { transformers: { serial_number: string; customer_sites: { site_name: string } | null } | null }
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

    const [{ data: customers }, { data: closures }, { data: checkins }, { data: attendanceRows }, { data: holidays }] = await Promise.all([
      customerIds.length
        ? admin.from('customers').select('id, name, customer_type').in('id', customerIds)
        : Promise.resolve({ data: [] as { id: string; name: string; customer_type: string | null }[] }),
      workOrderIds.length
        ? admin.from('work_order_daily_closures').select('work_order_id, outcome, needs_reassignment, revisit_date, created_at').in('work_order_id', workOrderIds)
        : Promise.resolve({ data: [] as { work_order_id: string; outcome: string; needs_reassignment: boolean; revisit_date: string | null; created_at: string }[] }),
      workOrderIds.length
        ? admin.from('work_order_checkins').select('work_order_id, checked_in_at').in('work_order_id', workOrderIds)
        : Promise.resolve({ data: [] as { work_order_id: string; checked_in_at: string }[] }),
      admin.from('attendance').select('id, engineer_id, attendance_date, status, marked_at, place_name, reason, approval_status, approved_by, approved_at, end_day_at, end_day_place_name').in('engineer_id', engineerIds).gte('attendance_date', from).lte('attendance_date', to),
      admin.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
    ])

    const custMap: Record<string, { name: string; customerType: string | null }> = {}
    customers?.forEach(c => { custMap[c.id] = { name: c.name, customerType: c.customer_type } })

    // work_order_id -> 'YYYY-MM-DD' -> earliest check-in that day.
    const checkinTimeByWoDay: Record<string, Record<string, string>> = {}
    for (const c of checkins || []) {
      const day = getISTDateStr(new Date(c.checked_in_at))
      if (!checkinTimeByWoDay[c.work_order_id]) checkinTimeByWoDay[c.work_order_id] = {}
      const existing = checkinTimeByWoDay[c.work_order_id][day]
      if (!existing || c.checked_in_at < existing) checkinTimeByWoDay[c.work_order_id][day] = c.checked_in_at
    }
    // work_order_id -> 'YYYY-MM-DD' -> that day's closure (last one wins if more
    // than one was somehow submitted the same day).
    const closureByWoDay: Record<string, Record<string, { outcome: string; needsReassignment: boolean; revisitDate: string | null; createdAt: string }>> = {}
    for (const c of closures || []) {
      const day = getISTDateStr(new Date(c.created_at))
      if (!closureByWoDay[c.work_order_id]) closureByWoDay[c.work_order_id] = {}
      closureByWoDay[c.work_order_id][day] = { outcome: c.outcome, needsReassignment: c.needs_reassignment, revisitDate: c.revisit_date, createdAt: c.created_at }
    }
    const checkinDaysByWo: Record<string, Set<string>> = {}
    for (const woId of Object.keys(checkinTimeByWoDay)) checkinDaysByWo[woId] = new Set(Object.keys(checkinTimeByWoDay[woId]))

    const nameByApprover = await resolveApprovedByNames(admin, (attendanceRows || []).map(r => r.approved_by))
    const attendanceByEngDate: Record<string, AttendanceRowCore & { id: string }> = {}
    ;(attendanceRows || []).forEach(r => {
      attendanceByEngDate[`${r.engineer_id}:${r.attendance_date}`] = { ...r, approved_by_name: r.approved_by ? nameByApprover[r.approved_by] ?? null : null }
    })
    const holidayByDate: Record<string, string> = {}
    ;(holidays || []).forEach(h => { holidayByDate[h.holiday_date] = h.name })

    function buildJob(w: Row, day: string): AttendanceOverviewJob {
      const wot = w.work_order_transformers || []
      const site = wot[0]?.transformers?.customer_sites
      const serialNumbers = wot.map(t => t.transformers?.serial_number).filter(Boolean).join(', ') || '—'
      const cust = custMap[w.customer_id]
      const endUserType = cust?.customerType === 'utility' ? 'Utility' : cust?.customerType === 'industry' ? 'Industry' : null

      let state: AttendanceOverviewJob['state']
      const checkedInAt = checkinTimeByWoDay[w.id]?.[day] ?? null
      if (day > todayStr) {
        state = { kind: 'assigned' }
      } else if (!checkedInAt) {
        state = { kind: 'no_show' }
      } else {
        const closure = closureByWoDay[w.id]?.[day]
        if (closure && closure.outcome === 'completed' && !closure.needsReassignment) {
          state = { kind: 'completed', checkedInAt, completedAt: closure.createdAt }
        } else {
          state = { kind: 'in_progress', checkedInAt, followUpDate: closure?.revisitDate ?? null, needsReassignment: !!closure?.needsReassignment }
        }
      }

      return {
        workOrderId: w.id,
        woNumber: w.wo_number,
        projectName: site?.site_name ?? null,
        serialNumbers,
        endUserType,
        state,
      }
    }

    // engineerId:date -> jobs that day
    const jobsByEngDate: Record<string, AttendanceOverviewJob[]> = {}
    function pushJob(w: Row, day: string) {
      if (!w.engineer_id) return
      const key = `${w.engineer_id}:${day}`
      if (!jobsByEngDate[key]) jobsByEngDate[key] = []
      jobsByEngDate[key].push(buildJob(w, day))
    }
    for (const w of wos) {
      if (w.scheduled_date && w.scheduled_date >= from && w.scheduled_date <= to) {
        pushJob(w, w.scheduled_date)
      }
      for (const day of checkinDaysByWo[w.id] || []) {
        if (day === w.scheduled_date) continue
        if (day < from || day > to) continue
        pushJob(w, day)
      }
    }

    const rows: AttendanceOverviewRow[] = []
    for (const eng of engineers) {
      const profileCreatedAtDateStr = eng.createdAt ? getISTDateStr(new Date(eng.createdAt)) : null
      for (const dateStr of dates) {
        const row = attendanceByEngDate[`${eng.id}:${dateStr}`] ?? null
        const attendance = computeEffectiveStatus({ dateStr, todayStr, row, holidayName: holidayByDate[dateStr] ?? null, profileCreatedAtDateStr })
        rows.push({
          engineerId: eng.id,
          engineerName: eng.name,
          date: dateStr,
          attendance,
          markedAt: row?.marked_at ?? null,
          placeName: row?.place_name ?? null,
          endDayAt: row?.end_day_at ?? null,
          endDayPlaceName: row?.end_day_place_name ?? null,
          attendanceId: row?.id ?? null,
          jobs: jobsByEngDate[`${eng.id}:${dateStr}`] || [],
        })
      }
    }

    return { rows, error: null }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  }
}
