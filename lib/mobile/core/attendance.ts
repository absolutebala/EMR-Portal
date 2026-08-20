// Field engineer daily attendance — shared core logic used by both the PWA's server
// actions (app/actions/attendance.ts) and the React Native REST routes
// (app/api/mobile/v1/attendance/*), plus the desktop manager-approval/export surface
// (app/(app)/attendance/AttendancePageClient.tsx).
//
// An unmarked day is never written as an explicit "Leave" row — it's computed on read
// ("no present row for this engineer+date, and it's past the 11am IST cutoff or a past
// date" -> Leave). This avoids needing a cron job, matching how the rest of the app
// already computes "at risk"/"missed" state on read.
//
// The 11am cutoff is the entire point of this feature, so every date/time comparison
// here explicitly pins Asia/Kolkata — unlike the ambient `toLocaleDateString('en-CA')`
// shortcut used elsewhere in this codebase, which silently follows the server
// process's own timezone (UTC on this app's ECS tasks).
import { type AdminClient, withTimeout } from './shared'
import { notifyUsers } from '@/lib/notifications'

const IST_TZ = 'Asia/Kolkata'
const CUTOFF_HOUR = 11 // 11:00 AM IST

export function getISTDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function getISTHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date)
  return parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
}

export function isPastAttendanceCutoff(date: Date = new Date()): boolean {
  return getISTHour(date) >= CUTOFF_HOUR
}

// Date-only strings parse as UTC midnight, so .getUTCDay() reads the weekday of the
// IST calendar date itself without any further timezone shifting.
function isSunday(istDateStr: string): boolean {
  return new Date(`${istDateStr}T00:00:00Z`).getUTCDay() === 0
}

function eachDateStr(fromStr: string, toStr: string): string[] {
  const dates: string[] = []
  for (let d = new Date(`${fromStr}T00:00:00Z`); d <= new Date(`${toStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export interface AttendanceRowCore {
  status: 'present' | 'leave'
  approval_status: 'pending' | 'approved' | 'rejected' | null
  reason: string | null
  marked_at: string | null
}

export type AttendanceEffectiveStatus =
  | { kind: 'holiday'; name: string }
  | { kind: 'weekly_off' }
  | { kind: 'not_applicable' }
  | { kind: 'pending' }
  | { kind: 'leave'; pendingApproval: boolean; rejected: boolean; reason: string | null; markedAt: string | null }
  | { kind: 'present'; reason: string | null; amended: boolean }

export function computeEffectiveStatus(params: {
  dateStr: string
  todayStr: string
  row: AttendanceRowCore | null
  holidayName: string | null
  profileCreatedAtDateStr: string | null
}): AttendanceEffectiveStatus {
  const { dateStr, todayStr, row, holidayName, profileCreatedAtDateStr } = params

  if (row && row.status === 'present') {
    if (row.approval_status === 'pending' || row.approval_status === 'rejected') {
      return { kind: 'leave', pendingApproval: row.approval_status === 'pending', rejected: row.approval_status === 'rejected', reason: row.reason, markedAt: row.marked_at }
    }
    return { kind: 'present', reason: row.reason, amended: row.approval_status === 'approved' }
  }

  // An explicit self-marked Leave (e.g. via the mobile "On Leave" status prompt,
  // see setEngineerStatusCore) — distinct from the auto-computed "no row at all"
  // case below, since this one carries a real timestamp of when it was set.
  if (row && row.status === 'leave') {
    return { kind: 'leave', pendingApproval: false, rejected: false, reason: row.reason, markedAt: row.marked_at }
  }

  if (holidayName) return { kind: 'holiday', name: holidayName }
  if (isSunday(dateStr)) return { kind: 'weekly_off' }
  if (profileCreatedAtDateStr && dateStr < profileCreatedAtDateStr) return { kind: 'not_applicable' }

  if (dateStr === todayStr) return isPastAttendanceCutoff() ? { kind: 'leave', pendingApproval: false, rejected: false, reason: null, markedAt: null } : { kind: 'pending' }
  if (dateStr < todayStr) return { kind: 'leave', pendingApproval: false, rejected: false, reason: null, markedAt: null }
  return { kind: 'not_applicable' } // future date
}

export function getAttendanceStatusLabel(s: AttendanceEffectiveStatus): string {
  switch (s.kind) {
    case 'present': return s.amended ? 'Present (amended)' : 'Present'
    case 'leave': return s.rejected ? 'Leave (amendment rejected)' : s.pendingApproval ? 'Leave (pending approval)' : 'Leave'
    case 'holiday': return `Holiday: ${s.name}`
    case 'weekly_off': return 'Weekly Off'
    case 'pending': return 'Pending'
    case 'not_applicable': return '—'
  }
}

async function getProfileCreatedAtDateStr(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('created_at').eq('id', userId).maybeSingle()
  return data?.created_at ? getISTDateStr(new Date(data.created_at)) : null
}

export async function getMyAttendanceStatusCore(admin: AdminClient, userId: string): Promise<{ status: AttendanceEffectiveStatus; error: string | null }> {
  try {
    const todayStr = getISTDateStr()
    const [{ data: row }, { data: holiday }, profileCreatedAtDateStr] = await Promise.all([
      admin.from('attendance').select('status, approval_status, reason, marked_at').eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle(),
      admin.from('holidays').select('name').eq('holiday_date', todayStr).maybeSingle(),
      getProfileCreatedAtDateStr(admin, userId),
    ])

    const status = computeEffectiveStatus({
      dateStr: todayStr, todayStr, row: row ?? null, holidayName: holiday?.name ?? null, profileCreatedAtDateStr,
    })
    return { status, error: null }
  } catch (e: unknown) {
    return { status: { kind: 'pending' }, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function markAttendanceCore(admin: AdminClient, userId: string, params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const late = isPastAttendanceCutoff(now)

    if (late && !params.reason?.trim()) {
      return { error: 'A reason is required when marking attendance after 11:00 AM', needsApproval: false }
    }

    const { data: existing } = await admin.from('attendance').select('status, approval_status')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()

    if (existing && existing.status === 'present' && existing.approval_status !== 'rejected') {
      return {
        error: existing.approval_status === 'pending' ? 'Your amendment request is already pending approval' : 'Attendance already marked for today',
        needsApproval: false,
      }
    }

    const result = await withTimeout(
      admin.from('attendance').upsert({
        engineer_id: userId,
        attendance_date: todayStr,
        status: 'present',
        marked_at: now.toISOString(),
        latitude: params.latitude,
        longitude: params.longitude,
        place_name: params.placeName,
        reason: late ? params.reason!.trim() : null,
        approval_status: late ? 'pending' : null,
        approved_by: null,
        approved_at: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'engineer_id,attendance_date' }).select('id').single(),
      8000
    )
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.', needsApproval: false }
    if (result.error) return { error: result.error.message, needsApproval: false }

    if (late && result.data) {
      notifyUsers(admin, [{ role: 'Service Manager' }, { role: 'Head of Service' }, { role: 'Super Admin' }], {
        type: 'attendance_amendment_pending',
        title: 'Attendance amendment needs approval',
        body: 'An engineer requested to mark today present after the 11am cutoff.',
        entityType: 'attendance', entityId: result.data.id,
        linkPath: '/attendance',
      }).catch(() => {})
    }

    return { error: null, needsApproval: late }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

export interface AttendanceCalendarDay {
  date: string
  status: AttendanceEffectiveStatus
  activity: { action: string; actorName: string; createdAt: string }[]
}

export async function getAttendanceCalendarCore(admin: AdminClient, userId: string, from: string, to: string): Promise<{ days: AttendanceCalendarDay[]; error: string | null }> {
  try {
    const todayStr = getISTDateStr()

    const [{ data: rows }, { data: holidays }, profileCreatedAtDateStr, { data: woIdRows }] = await Promise.all([
      admin.from('attendance').select('attendance_date, status, marked_at, reason, approval_status').eq('engineer_id', userId).gte('attendance_date', from).lte('attendance_date', to),
      admin.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
      getProfileCreatedAtDateStr(admin, userId),
      admin.from('work_orders').select('id').eq('engineer_id', userId),
    ])

    const woIds = (woIdRows || []).map(w => w.id)
    let activityRows: { action: string; actor_name: string; created_at: string }[] = []
    if (woIds.length) {
      const { data } = await admin.from('work_order_activity').select('action, actor_name, created_at')
        .in('work_order_id', woIds)
        .gte('created_at', `${from}T00:00:00Z`)
        .lte('created_at', `${to}T23:59:59Z`)
        .order('created_at', { ascending: true })
      activityRows = data || []
    }

    const rowByDate: Record<string, AttendanceRowCore> = {}
    ;(rows || []).forEach(r => { rowByDate[r.attendance_date] = r })
    const holidayByDate: Record<string, string> = {}
    ;(holidays || []).forEach(h => { holidayByDate[h.holiday_date] = h.name })
    const activityByDate: Record<string, { action: string; actorName: string; createdAt: string }[]> = {}
    activityRows.forEach(a => {
      const d = getISTDateStr(new Date(a.created_at))
      if (!activityByDate[d]) activityByDate[d] = []
      activityByDate[d].push({ action: a.action, actorName: a.actor_name, createdAt: a.created_at })
    })

    const days: AttendanceCalendarDay[] = eachDateStr(from, to).map(dateStr => ({
      date: dateStr,
      status: computeEffectiveStatus({ dateStr, todayStr, row: rowByDate[dateStr] ?? null, holidayName: holidayByDate[dateStr] ?? null, profileCreatedAtDateStr }),
      activity: activityByDate[dateStr] || [],
    }))

    return { days, error: null }
  } catch (e: unknown) {
    return { days: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export interface PendingAmendment {
  id: string
  engineerId: string
  engineerName: string
  attendanceDate: string
  reason: string | null
  markedAt: string | null
  placeName: string | null
}

export async function getPendingAmendmentsCore(admin: AdminClient): Promise<{ amendments: PendingAmendment[]; error: string | null }> {
  try {
    const { data: rows, error } = await admin.from('attendance')
      .select('id, engineer_id, attendance_date, reason, marked_at, place_name')
      .eq('approval_status', 'pending')
      .order('attendance_date', { ascending: false })
    if (error) return { amendments: [], error: error.message }

    const engineerIds = [...new Set((rows || []).map(r => r.engineer_id))]
    const { data: profiles } = engineerIds.length
      ? await admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] }
    const nameById: Record<string, string> = {}
    ;(profiles || []).forEach(p => { nameById[p.id] = `${p.first_name} ${p.last_name}` })

    const amendments: PendingAmendment[] = (rows || []).map(r => ({
      id: r.id, engineerId: r.engineer_id, engineerName: nameById[r.engineer_id] || 'Engineer',
      attendanceDate: r.attendance_date, reason: r.reason, markedAt: r.marked_at, placeName: r.place_name,
    }))
    return { amendments, error: null }
  } catch (e: unknown) {
    return { amendments: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function approveRejectAmendmentCore(admin: AdminClient, managerId: string, attendanceId: string, decision: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  try {
    const { data: row } = await admin.from('attendance').select('engineer_id, attendance_date').eq('id', attendanceId).maybeSingle()
    if (!row) return { error: 'Amendment request not found' }

    const { error } = await admin.from('attendance').update({
      approval_status: decision,
      approved_by: managerId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', attendanceId)
    if (error) return { error: error.message }

    const { data: manager } = await admin.from('profiles').select('first_name, last_name').eq('id', managerId).maybeSingle()
    const managerName = manager ? `${manager.first_name} ${manager.last_name}` : 'Your manager'
    notifyUsers(admin, [{ userId: row.engineer_id }], {
      type: 'attendance_amendment_decided',
      title: decision === 'approved' ? 'Attendance amendment approved' : 'Attendance amendment rejected',
      body: `${managerName} ${decision} your attendance amendment for ${row.attendance_date}.`,
      entityType: 'attendance', entityId: attendanceId,
      linkPath: '/mobile/attendance',
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export interface AttendanceExportRow {
  engineerName: string
  date: string
  status: string
  markedAt: string | null
  reason: string | null
}

export async function getAttendanceExportRowsCore(admin: AdminClient, from: string, to: string): Promise<{ rows: AttendanceExportRow[]; error: string | null }> {
  try {
    const todayStr = getISTDateStr()
    const [{ data: engineers }, { data: rows }, { data: holidays }] = await Promise.all([
      admin.from('profiles').select('id, first_name, last_name, created_at').eq('role', 'Field Engineer'),
      admin.from('attendance').select('engineer_id, attendance_date, status, marked_at, reason, approval_status').gte('attendance_date', from).lte('attendance_date', to),
      admin.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
    ])

    const rowByEngDate: Record<string, AttendanceRowCore & { marked_at: string | null }> = {}
    ;(rows || []).forEach(r => { rowByEngDate[`${r.engineer_id}:${r.attendance_date}`] = r })
    const holidayByDate: Record<string, string> = {}
    ;(holidays || []).forEach(h => { holidayByDate[h.holiday_date] = h.name })

    const dates = eachDateStr(from, to)
    const exportRows: AttendanceExportRow[] = []
    for (const eng of engineers || []) {
      const profileCreatedAtDateStr = eng.created_at ? getISTDateStr(new Date(eng.created_at)) : null
      for (const dateStr of dates) {
        const row = rowByEngDate[`${eng.id}:${dateStr}`] ?? null
        const eff = computeEffectiveStatus({ dateStr, todayStr, row, holidayName: holidayByDate[dateStr] ?? null, profileCreatedAtDateStr })
        if (eff.kind === 'not_applicable') continue
        exportRows.push({
          engineerName: `${eng.first_name} ${eng.last_name}`,
          date: dateStr,
          status: getAttendanceStatusLabel(eff),
          markedAt: row?.marked_at ?? null,
          reason: row?.reason ?? null,
        })
      }
    }
    return { rows: exportRows, error: null }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  }
}
