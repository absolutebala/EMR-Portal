// Field engineer daily attendance — shared core logic used by both the PWA's server
// actions (app/actions/attendance.ts) and the React Native REST routes
// (app/api/mobile/v1/attendance/*), plus the desktop manager-approval/export surface
// (app/(app)/attendance/AttendancePageClient.tsx).
//
// Policy: Punch In and Punch Out are both required every working day, for a combined
// minimum duration of 8:45 hours (this already includes a 45-minute lunch break, so
// the raw Punch In -> Punch Out span is what's checked, not "working time" net of
// lunch). Three violations can each independently put a day up for manager approval:
//   - Late In: Punch In after 10:00am IST.
//   - Early Out: Punch In -> Punch Out span under 8:45 hours.
//   - Single Punch: Punch In with no Punch Out by the time the day rolls over.
// A day with any of these still displays as Present (not Leave) — the violation is a
// flag on top of Present, resolved by manager approval, not a reclassification to
// absent. This matches the "provisional Present, finalized at Punch Out" design: an
// engineer's day shows Present the moment they punch in, and late_in/early_out/
// single_punch settle in as Punch Out happens (or the day ends without one).
//
// An unmarked day is never written as an explicit "Leave" row — it's computed on read
// ("no present row for this engineer+date, and it's past the 10am IST Late In cutoff
// or a past date" -> Leave). Single Punch is the one exception that DOES need a
// write-back once discovered (see resolveOverdueSinglePunches below), since it has to
// surface as a real pending-approval row for managers, not just a read-time label.
//
// All date/time comparisons here explicitly pin Asia/Kolkata — unlike the ambient
// `toLocaleDateString('en-CA')` shortcut used elsewhere in this codebase, which
// silently follows the server process's own timezone (UTC on this app's ECS tasks).
import { type AdminClient, withTimeout } from './shared'
import { notifyUsers } from '@/lib/notifications'

const IST_TZ = 'Asia/Kolkata'
const LATE_IN_HOUR = 10 // 10:00 AM IST — Punch In after this is "Late In"
const REQUIRED_DURATION_MIN = 8 * 60 + 45 // 8:45 hours, includes the 45-min lunch break
const END_DAY_FIXED_HOUR = 18
const END_DAY_FIXED_MINUTE = 45 // 6:45 PM IST

export function getISTDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function getISTHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date)
  return parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
}

export function isPastAttendanceCutoff(date: Date = new Date()): boolean {
  return getISTHour(date) >= LATE_IN_HOUR
}

// Earliest moment End Day/Punch Out becomes available for a given Punch In time:
// whichever comes first between the fixed 6:45pm IST floor and 8:45 hours after
// Punch In. A normal on-time Punch In hits its 8:45-hour mark before 6:45pm, so the
// button opens right when the required duration is complete; a late Punch In hits
// 6:45pm first, so the button still opens at a fixed end-of-day time rather than
// forcing an unreasonably late Punch Out — any resulting shortfall is simply flagged
// Early Out for approval.
export function getEndDayEnableAt(markedAt: Date): Date {
  const dateStr = getISTDateStr(markedAt)
  // IST midnight of that calendar date, expressed as the UTC instant it actually is
  // (IST is UTC+5:30, so it falls 5.5 hours before the UTC-labeled midnight).
  const istMidnightUtcMs = new Date(`${dateStr}T00:00:00.000Z`).getTime() - 5.5 * 60 * 60000
  const fixedFloor = new Date(istMidnightUtcMs + (END_DAY_FIXED_HOUR * 60 + END_DAY_FIXED_MINUTE) * 60000)
  const durationFloor = new Date(markedAt.getTime() + REQUIRED_DURATION_MIN * 60000)
  return durationFloor.getTime() <= fixedFloor.getTime() ? durationFloor : fixedFloor
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
  place_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  late_in: boolean
  early_out: boolean
  single_punch: boolean
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
  | {
      kind: 'present'
      reason: string | null
      pendingApproval: boolean
      rejected: boolean
      amended: boolean
      lateIn: boolean
      earlyOut: boolean
      singlePunch: boolean
      approvedByName: string | null
      approvedAt: string | null
      markedAt: string | null
      placeName: string | null
      endDayAt: string | null
      endDayPlaceName: string | null
      // ISO timestamp of when End Day becomes available; null once already ended or
      // if there's no marked_at to compute from.
      endDayEnableAt: string | null
    }

export function computeEffectiveStatus(params: {
  dateStr: string
  todayStr: string
  row: AttendanceRowCore | null
  holidayName: string | null
  profileCreatedAtDateStr: string | null
}): AttendanceEffectiveStatus {
  const { dateStr, todayStr, row, holidayName, profileCreatedAtDateStr } = params

  if (row && row.status === 'present') {
    const endDayAt = row.end_day_at ?? null
    return {
      kind: 'present',
      reason: row.reason,
      pendingApproval: row.approval_status === 'pending',
      rejected: row.approval_status === 'rejected',
      amended: row.approval_status === 'approved',
      lateIn: row.late_in,
      earlyOut: row.early_out,
      singlePunch: row.single_punch,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      markedAt: row.marked_at,
      placeName: row.place_name,
      endDayAt,
      endDayPlaceName: row.end_day_place_name ?? null,
      endDayEnableAt: !endDayAt && row.marked_at ? getEndDayEnableAt(new Date(row.marked_at)).toISOString() : null,
    }
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
    case 'present': {
      const flags: string[] = []
      if (s.lateIn) flags.push('Late In')
      if (s.earlyOut) flags.push('Early Out')
      if (s.singlePunch) flags.push('Single Punch')
      if (!flags.length) return 'Present'
      const decision = s.rejected ? 'rejected' : s.pendingApproval ? 'pending approval' : s.amended ? 'approved' : null
      return `Present (${flags.join(', ')}${decision ? ` — ${decision}` : ''})`
    }
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

const ATTENDANCE_ROW_COLUMNS = 'status, approval_status, reason, marked_at, place_name, approved_by, approved_at, late_in, early_out, single_punch, end_day_at, end_day_place_name'

// Sweeps for a Punch In with no Punch Out once its calendar day (IST) has already
// ended — no cron job in this codebase (see file header), so this runs lazily
// whenever a surface that would show the result is read: the engineer's own status/
// calendar, and the manager's pending-amendments list. Unlike the read-only "no row
// -> Leave" computation above, this one does need a write-back, since Single Punch
// has to appear as a real pending-approval row for managers to act on.
async function resolveOverdueSinglePunches(admin: AdminClient, engineerId?: string): Promise<void> {
  const todayStr = getISTDateStr()
  let query = admin.from('attendance').select('id, attendance_date')
    .eq('status', 'present').is('end_day_at', null).eq('single_punch', false).lt('attendance_date', todayStr)
  if (engineerId) query = query.eq('engineer_id', engineerId)
  const { data: rows } = await query
  if (!rows || !rows.length) return

  await admin.from('attendance')
    .update({ single_punch: true, approval_status: 'pending', updated_at: new Date().toISOString() })
    .in('id', rows.map(r => r.id))

  for (const row of rows) {
    notifyUsers(admin, [
      { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
    ], {
      type: 'attendance_amendment_pending',
      title: 'Attendance amendment needs approval',
      body: `An engineer has a Single Punch (missing Punch Out) for ${row.attendance_date}.`,
      entityType: 'attendance', entityId: row.id,
      linkPath: '/attendance',
    }).catch(() => {})
  }
}

export async function getMyAttendanceStatusCore(admin: AdminClient, userId: string): Promise<{ status: AttendanceEffectiveStatus; error: string | null }> {
  try {
    await resolveOverdueSinglePunches(admin, userId)

    const todayStr = getISTDateStr()
    const [{ data: row }, { data: holiday }, profileCreatedAtDateStr] = await Promise.all([
      admin.from('attendance').select(ATTENDANCE_ROW_COLUMNS).eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle(),
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
  // "late" (reason required, pending approval), since there's no Late In cutoff
  // concept for a day that's already over.
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
    const lateIn = isToday ? isPastAttendanceCutoff(now) : true

    if (lateIn && !params.reason?.trim()) {
      return { error: isToday ? 'A reason is required when punching in after 10:00 AM' : 'A reason is required to amend a past date', needsApproval: false }
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
        reason: lateIn ? params.reason!.trim() : null,
        approval_status: lateIn ? 'pending' : null,
        approved_by: null,
        approved_at: null,
        late_in: lateIn,
        early_out: false,
        single_punch: false,
        end_day_at: null,
        end_day_latitude: null,
        end_day_longitude: null,
        end_day_place_name: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'engineer_id,attendance_date' }).select('id').single(),
      8000
    )
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.', needsApproval: false }
    if (result.error) return { error: result.error.message, needsApproval: false }

    if (lateIn && result.data) {
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
            ? 'An engineer punched in after the 10:00 AM cutoff (Late In).'
            : `An engineer requested to amend their attendance for ${targetDateStr} to Present.`,
          entityType: 'attendance', entityId: result.data!.id,
          linkPath: '/attendance',
        }).catch(() => {})
      })().catch(() => {})
    }

    return { error: null, needsApproval: lateIn }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

// End-of-day Punch Out — distinct from the app's own session Sign Out. Only
// available today, only after Punch In (Present) has already happened, once per
// day, and not before the policy's enable time (whichever comes first of 6:45pm IST
// or 8:45 hours after Punch In — see getEndDayEnableAt). If the completed Punch In ->
// Punch Out span falls short of 8:45 hours, this flags Early Out and requires a
// reason the same way a Late In Punch In does.
export async function markEndDayCore(admin: AdminClient, userId: string, params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const todayStr = getISTDateStr()
    const { data: existing } = await admin.from('attendance')
      .select('id, status, marked_at, end_day_at, late_in, approval_status')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()

    if (!existing || existing.status !== 'present') {
      return { error: 'Punch in before ending your day', needsApproval: false }
    }
    if (existing.end_day_at) {
      return { error: "You've already ended your day", needsApproval: false }
    }
    if (!existing.marked_at) {
      return { error: 'Missing Punch In time — contact your manager', needsApproval: false }
    }

    const now = new Date()
    const markedAt = new Date(existing.marked_at)
    const enableAt = getEndDayEnableAt(markedAt)
    if (now < enableAt) {
      const enableAtIst = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(enableAt)
      return { error: `You can end your day from ${enableAtIst} — after 6:45 PM or 8:45 hours from your Punch In, whichever comes first.`, needsApproval: false }
    }

    const durationMin = (now.getTime() - markedAt.getTime()) / 60000
    const earlyOut = durationMin < REQUIRED_DURATION_MIN
    // Only a NEW violation re-opens approval — if Late In was already reviewed
    // (approved/rejected) this morning and Early Out doesn't newly apply, the
    // existing decision must stand, not silently flip back to pending.
    const wasAlreadyPending = existing.approval_status === 'pending'
    const newlyNeedsApproval = earlyOut && !wasAlreadyPending

    if (newlyNeedsApproval && !params.reason?.trim()) {
      return { error: 'A reason is required — your working duration is under 8:45 hours (Early Out).', needsApproval: false }
    }

    const finalApprovalStatus = newlyNeedsApproval ? 'pending' : existing.approval_status

    const result = await withTimeout(
      admin.from('attendance').update({
        end_day_at: now.toISOString(),
        end_day_latitude: params.latitude,
        end_day_longitude: params.longitude,
        end_day_place_name: params.placeName,
        early_out: earlyOut,
        approval_status: finalApprovalStatus,
        reason: newlyNeedsApproval ? params.reason!.trim() : undefined,
        updated_at: now.toISOString(),
      }).eq('id', existing.id),
      8000
    )
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.', needsApproval: false }
    if (result.error) return { error: result.error.message, needsApproval: false }

    if (newlyNeedsApproval) {
      notifyUsers(admin, [
        { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
      ], {
        type: 'attendance_amendment_pending',
        title: 'Attendance amendment needs approval',
        body: 'An engineer ended their day under 8:45 hours (Early Out).',
        entityType: 'attendance', entityId: existing.id,
        linkPath: '/attendance',
      }).catch(() => {})
    }

    return { error: null, needsApproval: wasAlreadyPending || newlyNeedsApproval }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
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
    await resolveOverdueSinglePunches(admin, userId)

    const todayStr = getISTDateStr()

    const [{ data: rows }, { data: holidays }, profileCreatedAtDateStr] = await Promise.all([
      admin.from('attendance').select(`attendance_date, ${ATTENDANCE_ROW_COLUMNS}`).eq('engineer_id', userId).gte('attendance_date', from).lte('attendance_date', to),
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
  lateIn: boolean
  earlyOut: boolean
  singlePunch: boolean
}

export async function getPendingAmendmentsCore(admin: AdminClient): Promise<{ amendments: PendingAmendment[]; error: string | null }> {
  try {
    await resolveOverdueSinglePunches(admin)

    const { data: rows, error } = await admin.from('attendance')
      .select('id, engineer_id, attendance_date, reason, marked_at, place_name, late_in, early_out, single_punch')
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
      lateIn: r.late_in, earlyOut: r.early_out, singlePunch: r.single_punch,
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
