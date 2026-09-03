// Field engineer daily attendance — shared core logic used by both the PWA's server
// actions (app/actions/attendance.ts) and the React Native REST routes
// (app/api/mobile/v1/attendance/*), plus the desktop manager-approval/export surface
// (app/(app)/attendance/AttendancePageClient.tsx).
//
// Policy: Punch In and Punch Out are both required every working day. A day is Present
// only when the engineer punched in by 10:00am IST, punched out, and the gross span
// (Punch Out − Punch In) is at least 6 hours. Any of these causes makes the day ABSENT:
//   - Late In: Punch In at/after 10:00am IST.
//   - Short Hours: Punch In -> Punch Out span under 6 hours (stored in short_hours; the
//     legacy early_out column is no longer written and its value is surfaced as
//     `earlyOut` for backward compatibility only).
//   - Single Punch: Punch In with no Punch Out by the time the day rolls over.
//   - No Show: never punched in (computed on read, no row).
// Punch In / Punch Out only RECORD — they never auto-open an approval or notify anyone.
// A caused (or no-show) day is Absent, and the engineer separately taps "Request
// Amendment" (requestAttendanceAmendmentCore, the one and only notifier) to send it to
// the Service Manager. If approved the day becomes Present (with the cause noted, e.g.
// "late punch in"); if rejected it stays Absent and can be requested again.
//
// An unmarked day is never written as an explicit row — it's computed on read ("no row
// for this engineer+date, and it's past the 10am IST cutoff or a past date" -> Absent /
// No Show). Single Punch is the one exception that DOES need a write-back once discovered
// (see resolveOverdueSinglePunches below), so it surfaces as a real row managers can see.
//
// All date/time comparisons here explicitly pin Asia/Kolkata — unlike the ambient
// `toLocaleDateString('en-CA')` shortcut used elsewhere in this codebase, which
// silently follows the server process's own timezone (UTC on this app's ECS tasks).
import { type AdminClient, withTimeout } from './shared'
import { notifyUsers } from '@/lib/notifications'

const IST_TZ = 'Asia/Kolkata'
const LATE_IN_HOUR = 10 // 10:00 AM IST — Punch In at/after this hour is "Late In"
const MIN_DURATION_MIN = 6 * 60 // 6 hours gross (Punch Out − Punch In); under this is "Short Hours"

export function getISTDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function getISTHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date)
  return parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
}

// Punch In at 10:00 AM IST or later is "Late In".
export function isPastAttendanceCutoff(date: Date = new Date()): boolean {
  return getISTHour(date) >= LATE_IN_HOUR
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
  short_hours: boolean
  // Only selected by callers that need it (e.g. getAttendanceCalendarCore) — optional
  // since computeEffectiveStatus itself never reads these.
  end_day_at?: string | null
  end_day_place_name?: string | null
}

// Shared shape for a working day the engineer has (or should have) attendance for.
// 'present' = the day counts as Present (on time + >=6h, OR an approved amendment).
// 'leave' = Absent — any unapproved cause (late in / short hours / single punch) or a
// no-show. Both carry the full punch-in/out detail so an Absent day still shows when
// they punched in/out and why it didn't count.
interface AttendanceDay {
  reason: string | null
  pendingApproval: boolean
  rejected: boolean
  amended: boolean
  lateIn: boolean
  // 'earlyOut' now carries the Short Hours cause (< 6h gross) — kept under this name so
  // existing consumers keep compiling; surfaced as "Short Hours" in the UI.
  earlyOut: boolean
  singlePunch: boolean
  // No punch-in at all (never marked). Distinguishes a plain Absent from a punched-in
  // day that fell short.
  noShow: boolean
  approvedByName: string | null
  approvedAt: string | null
  markedAt: string | null
  placeName: string | null
  endDayAt: string | null
  endDayPlaceName: string | null
  // Retained for shape compatibility; there is no longer a Punch Out enable gate, so
  // this is always null (Punch Out is available any time after Punch In).
  endDayEnableAt: string | null
}

export type AttendanceEffectiveStatus =
  | { kind: 'holiday'; name: string }
  | { kind: 'weekly_off' }
  | { kind: 'not_applicable' }
  | { kind: 'pending' }
  | ({ kind: 'leave' } & AttendanceDay)
  | ({ kind: 'present' } & AttendanceDay)

export function computeEffectiveStatus(params: {
  dateStr: string
  todayStr: string
  row: AttendanceRowCore | null
  holidayName: string | null
  profileCreatedAtDateStr: string | null
}): AttendanceEffectiveStatus {
  const { dateStr, todayStr, row, holidayName, profileCreatedAtDateStr } = params

  // A row exists = the engineer punched in (marked_at). Derive Present vs Absent from
  // the causes + amendment decision.
  if (row && (row.status === 'present' || row.status === 'leave')) {
    const lateIn = row.late_in
    const shortHours = row.short_hours
    const singlePunch = row.single_punch
    const approved = row.approval_status === 'approved'
    const rejected = row.approval_status === 'rejected'
    const pending = row.approval_status === 'pending'
    const hasCause = lateIn || shortHours || singlePunch

    const common: AttendanceDay = {
      reason: row.reason,
      pendingApproval: pending,
      rejected,
      amended: approved,
      lateIn,
      earlyOut: shortHours,
      singlePunch,
      noShow: false,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      markedAt: row.marked_at,
      placeName: row.place_name,
      endDayAt: row.end_day_at ?? null,
      endDayPlaceName: row.end_day_place_name ?? null,
      endDayEnableAt: null,
    }

    // Approved amendment, or a clean punched-in day (on time + >=6h + punched out) with
    // no pending request = Present. A pending or rejected amendment is Absent regardless
    // of cause; and a day with an unresolved cause the engineer hasn't yet requested an
    // amendment for is Absent (with the amendment available to them).
    if (approved) return { kind: 'present', ...common }
    if (pending || rejected) return { kind: 'leave', ...common }
    if (hasCause) return { kind: 'leave', ...common }
    return { kind: 'present', ...common }
  }

  if (holidayName) return { kind: 'holiday', name: holidayName }
  if (isSunday(dateStr)) return { kind: 'weekly_off' }
  if (profileCreatedAtDateStr && dateStr < profileCreatedAtDateStr) return { kind: 'not_applicable' }

  const absentNoShow = (): AttendanceEffectiveStatus => ({
    kind: 'leave', reason: null, pendingApproval: false, rejected: false, amended: false,
    lateIn: false, earlyOut: false, singlePunch: false, noShow: true,
    approvedByName: null, approvedAt: null, markedAt: null, placeName: null,
    endDayAt: null, endDayPlaceName: null, endDayEnableAt: null,
  })

  if (dateStr === todayStr) {
    // Before 10 AM with no punch-in: still on time to punch in. After 10 AM: the day is
    // provisionally Absent, but punch-in stays open (a late punch-in then applies).
    return isPastAttendanceCutoff() ? absentNoShow() : { kind: 'pending' }
  }
  if (dateStr < todayStr) return absentNoShow() // a past day with no punch-in is Absent
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
      // Present with no cause = on-time full day. With a cause it's an approved
      // amendment — surface why it was amended.
      const flags: string[] = []
      if (s.lateIn) flags.push('late punch in')
      if (s.earlyOut) flags.push('short hours — approved')
      if (s.singlePunch) flags.push('single punch — approved')
      if (!flags.length) return 'Present'
      return `Present (${flags.join(', ')})`
    }
    case 'leave': {
      if (s.noShow) return s.pendingApproval ? 'Absent (pending approval)' : s.rejected ? 'Absent (amendment rejected)' : 'Absent'
      const flags: string[] = []
      if (s.lateIn) flags.push('Late In')
      if (s.earlyOut) flags.push('Short Hours')
      if (s.singlePunch) flags.push('Single Punch')
      const decision = s.rejected ? 'rejected' : s.pendingApproval ? 'pending approval' : null
      return `Absent (${flags.join(', ')}${decision ? ` — ${decision}` : ''})`
    }
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

const ATTENDANCE_ROW_COLUMNS = 'status, approval_status, reason, marked_at, place_name, approved_by, approved_at, late_in, early_out, single_punch, short_hours, end_day_at, end_day_place_name'

// Sweeps for a Punch In with no Punch Out once its calendar day (IST) has already
// ended — no cron job in this codebase (see file header), so this runs lazily
// whenever a surface that would show the result is read: the engineer's own status/
// calendar, and the manager's pending-amendments list. Unlike the read-only "no row
// -> Leave" computation above, this one does need a write-back, since Single Punch
// has to appear as a real pending-approval row for managers to act on.
async function resolveOverdueSinglePunches(admin: AdminClient, engineerId?: string): Promise<void> {
  const todayStr = getISTDateStr()
  let query = admin.from('attendance').select('id, attendance_date')
    .eq('status', 'present').not('marked_at', 'is', null).is('end_day_at', null).eq('single_punch', false).lt('attendance_date', todayStr)
  if (engineerId) query = query.eq('engineer_id', engineerId)
  const { data: rows } = await query
  if (!rows || !rows.length) return

  // Just flag the missing Punch Out — the day now reads Absent (Single Punch). No
  // amendment is auto-opened and no manager is notified; the engineer requests an
  // amendment themselves if they want it reviewed.
  await admin.from('attendance')
    .update({ single_punch: true, updated_at: new Date().toISOString() })
    .in('id', rows.map(r => r.id))
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

// Punch In — a real-time action for today only. Simply records the punch-in; a punch-in
// at/after 10:00 AM sets the Late In flag (the day then reads Absent until the engineer
// requests an amendment). No approval is opened here and no manager is notified — the
// Service Manager only ever sees a request when the engineer explicitly requests an
// amendment (see requestAttendanceAmendmentCore).
export async function markAttendanceCore(admin: AdminClient, userId: string, params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
  attendanceDate?: string
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const targetDateStr = params.attendanceDate ?? todayStr

    if (targetDateStr !== todayStr) {
      return { error: 'Punch In is only available for today. Use Request Amendment for a past day.', needsApproval: false }
    }

    const lateIn = isPastAttendanceCutoff(now)

    const { data: existing } = await admin.from('attendance').select('marked_at')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()
    if (existing?.marked_at) {
      return { error: 'You have already punched in today.', needsApproval: false }
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
        reason: null,
        approval_status: null,
        approved_by: null,
        approved_at: null,
        late_in: lateIn,
        early_out: false,
        single_punch: false,
        short_hours: false,
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

    return { error: null, needsApproval: false }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

// Punch Out — distinct from the app's own session Sign Out. Available any time after
// Punch In, today only, once per day. A gross span (Punch Out − Punch In) under 6 hours
// flags Short Hours (the day then reads Absent until the engineer requests an amendment).
// No approval is opened and no manager is notified here.
export async function markEndDayCore(admin: AdminClient, userId: string, params: {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  reason?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const todayStr = getISTDateStr()
    const { data: existing } = await admin.from('attendance')
      .select('id, marked_at, end_day_at')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()

    if (!existing || !existing.marked_at) {
      return { error: 'Punch in before punching out.', needsApproval: false }
    }
    if (existing.end_day_at) {
      return { error: "You've already punched out today.", needsApproval: false }
    }

    const now = new Date()
    const durationMin = (now.getTime() - new Date(existing.marked_at).getTime()) / 60000
    const shortHours = durationMin < MIN_DURATION_MIN

    const result = await withTimeout(
      admin.from('attendance').update({
        end_day_at: now.toISOString(),
        end_day_latitude: params.latitude,
        end_day_longitude: params.longitude,
        end_day_place_name: params.placeName,
        short_hours: shortHours,
        single_punch: false,
        updated_at: now.toISOString(),
      }).eq('id', existing.id),
      8000
    )
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.', needsApproval: false }
    if (result.error) return { error: result.error.message, needsApproval: false }

    return { error: null, needsApproval: false }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

// Explicit amendment request by the engineer — the ONLY place the Service Manager is
// notified. Covers today's Absent day (late in / short hours / single punch) and a past
// Absent day (no-show) within the current IST month. Sets the row to pending with the
// engineer's reason; a rejected day can be re-requested.
export async function requestAttendanceAmendmentCore(admin: AdminClient, userId: string, params: {
  attendanceDate: string
  reason: string
}): Promise<{ error: string | null }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const dateStr = params.attendanceDate
    if (dateStr > todayStr) return { error: 'Cannot request an amendment for a future date.' }
    if (dateStr.slice(0, 7) !== todayStr.slice(0, 7)) return { error: 'Amendments can only be requested within the current month.' }
    if (!params.reason?.trim()) return { error: 'A reason is required.' }

    const { data: existing } = await admin.from('attendance')
      .select('id, approval_status')
      .eq('engineer_id', userId).eq('attendance_date', dateStr).maybeSingle()

    if (existing?.approval_status === 'pending') return { error: 'Your amendment is already pending approval.' }
    if (existing?.approval_status === 'approved') return { error: 'This day is already approved.' }

    let attendanceId: string | undefined
    if (existing) {
      const { error } = await admin.from('attendance')
        .update({ approval_status: 'pending', reason: params.reason.trim(), approved_by: null, approved_at: null, updated_at: now.toISOString() })
        .eq('id', existing.id)
      if (error) return { error: error.message }
      attendanceId = existing.id
    } else {
      // Past no-show with no row yet — create the pending request (no punch times).
      const { data, error } = await admin.from('attendance').upsert({
        engineer_id: userId, attendance_date: dateStr, status: 'present', marked_at: null,
        reason: params.reason.trim(), approval_status: 'pending', approved_by: null, approved_at: null,
        late_in: false, early_out: false, single_punch: false, short_hours: false,
        end_day_at: null, updated_at: now.toISOString(),
      }, { onConflict: 'engineer_id,attendance_date' }).select('id').single()
      if (error) return { error: error.message }
      attendanceId = data?.id
    }

    if (attendanceId) {
      notifyUsers(admin, [
        { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
      ], {
        type: 'attendance_amendment_pending',
        title: 'Attendance amendment needs approval',
        body: `An engineer requested an attendance amendment for ${dateStr}.`,
        entityType: 'attendance', entityId: attendanceId,
        linkPath: '/attendance',
      }).catch(() => {})
    }

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
