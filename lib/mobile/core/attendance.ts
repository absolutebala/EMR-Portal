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
  approved_by_name: string | null
  approved_at: string | null
  // Only selected by callers that need it (e.g. getAttendanceCalendarCore) — optional
  // since computeEffectiveStatus itself never reads these.
  end_day_at?: string | null
  end_day_place_name?: string | null
}

export type AttendanceEffectiveStatus =
  | { kind: 'holiday'; name: string }
  | { kind: 'weekly_off' }
  | { kind: 'not_applicable' }
  | { kind: 'pending' }
  | { kind: 'leave'; pendingApproval: boolean; rejected: boolean; reason: string | null; markedAt: string | null; approvedByName: string | null; approvedAt: string | null }
  | { kind: 'present'; reason: string | null; amended: boolean; approvedByName: string | null; approvedAt: string | null }

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
      return {
        kind: 'leave', pendingApproval: row.approval_status === 'pending', rejected: row.approval_status === 'rejected',
        reason: row.reason, markedAt: row.marked_at, approvedByName: row.approved_by_name, approvedAt: row.approved_at,
      }
    }
    return { kind: 'present', reason: row.reason, amended: row.approval_status === 'approved', approvedByName: row.approved_by_name, approvedAt: row.approved_at }
  }

  // An explicit self-marked Leave (e.g. via the mobile "On Leave" status prompt,
  // see setEngineerStatusCore) — distinct from the auto-computed "no row at all"
  // case below, since this one carries a real timestamp of when it was set.
  if (row && row.status === 'leave') {
    return { kind: 'leave', pendingApproval: false, rejected: false, reason: row.reason, markedAt: row.marked_at, approvedByName: null, approvedAt: null }
  }

  if (holidayName) return { kind: 'holiday', name: holidayName }
  if (isSunday(dateStr)) return { kind: 'weekly_off' }
  if (profileCreatedAtDateStr && dateStr < profileCreatedAtDateStr) return { kind: 'not_applicable' }

  if (dateStr === todayStr) {
    return isPastAttendanceCutoff()
      ? { kind: 'leave', pendingApproval: false, rejected: false, reason: null, markedAt: null, approvedByName: null, approvedAt: null }
      : { kind: 'pending' }
  }
  if (dateStr < todayStr) return { kind: 'leave', pendingApproval: false, rejected: false, reason: null, markedAt: null, approvedByName: null, approvedAt: null }
  return { kind: 'not_applicable' } // future date
}

// Resolves a set of `attendance.approved_by` uuids to display names in one query —
// every caller that builds AttendanceRowCore objects uses this rather than
// duplicating the lookup.
export async function resolveApprovedByNames(admin: AdminClient, approvedByIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(approvedByIds.filter((id): id is string => !!id))]
  if (!ids.length) return {}
  const { data } = await admin.from('profiles').select('id, first_name, last_name').in('id', ids)
  const map: Record<string, string> = {}
  ;(data || []).forEach(p => { map[p.id] = `${p.first_name} ${p.last_name}` })
  return map
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
      admin.from('attendance').select('status, approval_status, reason, marked_at, approved_by, approved_at').eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle(),
      admin.from('holidays').select('name').eq('holiday_date', todayStr).maybeSingle(),
      getProfileCreatedAtDateStr(admin, userId),
    ])

    const nameByApprover = await resolveApprovedByNames(admin, [row?.approved_by ?? null])
    const rowWithName: AttendanceRowCore | null = row ? { ...row, approved_by_name: row.approved_by ? nameByApprover[row.approved_by] ?? null : null } : null

    const status = computeEffectiveStatus({
      dateStr: todayStr, todayStr, row: rowWithName, holidayName: holiday?.name ?? null, profileCreatedAtDateStr,
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
  // Defaults to today — pass an earlier date (same IST calendar month only) to amend
  // a past day's Leave to Present. Any non-today date is unconditionally treated as
  // "late" (reason required, pending approval), since there's no 11am-cutoff concept
  // for a day that's already over.
  attendanceDate?: string
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const targetDateStr = params.attendanceDate ?? todayStr

    if (targetDateStr > todayStr) {
      return { error: 'Cannot mark attendance for a future date', needsApproval: false }
    }
    if (targetDateStr.slice(0, 7) !== todayStr.slice(0, 7)) {
      return { error: 'Attendance can only be amended within the current month', needsApproval: false }
    }

    const isToday = targetDateStr === todayStr
    const late = isToday ? isPastAttendanceCutoff(now) : true

    if (late && !params.reason?.trim()) {
      return { error: isToday ? 'A reason is required when marking attendance after 11:00 AM' : 'A reason is required to amend a past date', needsApproval: false }
    }

    const { data: existing } = await admin.from('attendance').select('status, approval_status')
      .eq('engineer_id', userId).eq('attendance_date', targetDateStr).maybeSingle()

    if (existing && existing.status === 'present' && existing.approval_status !== 'rejected') {
      return {
        error: existing.approval_status === 'pending' ? 'Your amendment request is already pending approval' : 'Attendance already marked for that date',
        needsApproval: false,
      }
    }

    const result = await withTimeout(
      admin.from('attendance').upsert({
        engineer_id: userId,
        attendance_date: targetDateStr,
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
      // Any Service Manager can act as level-1 approver (Field Engineers no longer
      // report to one fixed Service Manager), Head of Service/Super Admin as level 2.
      ;(async () => {
        const targets = [
          { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
        ]
        notifyUsers(admin, targets, {
          type: 'attendance_amendment_pending',
          title: 'Attendance amendment needs approval',
          body: isToday
            ? 'An engineer requested to mark today present after the 11am cutoff.'
            : `An engineer requested to amend their attendance for ${targetDateStr} to Present.`,
          entityType: 'attendance', entityId: result.data!.id,
          linkPath: '/attendance',
        }).catch(() => {})
      })().catch(() => {})
    }

    return { error: null, needsApproval: late }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

// A separate end-of-day sign-off, distinct from the app's own session Sign Out —
// only available today, only after Present has already been marked, once per day.
// No cutoff/approval concept (unlike a late morning mark) — just a plain capture.
export async function markEndDayCore(admin: AdminClient, userId: string, params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
}): Promise<{ error: string | null }> {
  try {
    const todayStr = getISTDateStr()
    const { data: existing } = await admin.from('attendance').select('id, status, end_day_at')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()

    if (!existing || existing.status !== 'present') {
      return { error: 'Mark attendance present before ending your day' }
    }
    if (existing.end_day_at) {
      return { error: "You've already ended your day" }
    }

    const result = await withTimeout(
      admin.from('attendance').update({
        end_day_at: new Date().toISOString(),
        end_day_latitude: params.latitude,
        end_day_longitude: params.longitude,
        end_day_place_name: params.placeName,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id),
      8000
    )
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.' }
    if (result.error) return { error: result.error.message }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export interface AttendanceCalendarDay {
  date: string
  status: AttendanceEffectiveStatus
  // Raw marked_at off whatever attendance row exists for this date, regardless of
  // status kind — status.markedAt only carries a value for the 'leave' kind, so this
  // is what callers (e.g. an export) use to show a real time for a Present day too.
  markedAt: string | null
  // End-of-day sign-off — separate from the app's Sign Out. Null until the engineer
  // taps "End Day" (only available once Present is marked, today only).
  endDayAt: string | null
  endDayPlaceName: string | null
}

export async function getAttendanceCalendarCore(admin: AdminClient, userId: string, from: string, to: string): Promise<{ days: AttendanceCalendarDay[]; error: string | null }> {
  try {
    const todayStr = getISTDateStr()

    const [{ data: rows }, { data: holidays }, profileCreatedAtDateStr] = await Promise.all([
      admin.from('attendance').select('attendance_date, status, marked_at, reason, approval_status, approved_by, approved_at, end_day_at, end_day_place_name').eq('engineer_id', userId).gte('attendance_date', from).lte('attendance_date', to),
      admin.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
      getProfileCreatedAtDateStr(admin, userId),
    ])

    const nameByApprover = await resolveApprovedByNames(admin, (rows || []).map(r => r.approved_by))
    const rowByDate: Record<string, AttendanceRowCore> = {}
    ;(rows || []).forEach(r => { rowByDate[r.attendance_date] = { ...r, approved_by_name: r.approved_by ? nameByApprover[r.approved_by] ?? null : null } })
    const holidayByDate: Record<string, string> = {}
    ;(holidays || []).forEach(h => { holidayByDate[h.holiday_date] = h.name })

    const days: AttendanceCalendarDay[] = eachDateStr(from, to).map(dateStr => ({
      date: dateStr,
      status: computeEffectiveStatus({ dateStr, todayStr, row: rowByDate[dateStr] ?? null, holidayName: holidayByDate[dateStr] ?? null, profileCreatedAtDateStr }),
      markedAt: rowByDate[dateStr]?.marked_at ?? null,
      endDayAt: rowByDate[dateStr]?.end_day_at ?? null,
      endDayPlaceName: rowByDate[dateStr]?.end_day_place_name ?? null,
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

