// Field engineer daily attendance — shared core logic used by both the PWA's server
// actions (app/actions/attendance.ts) and the React Native REST routes
// (app/api/mobile/v1/attendance/*), plus the desktop manager-approval/export surface
// (app/(app)/attendance/AttendancePageClient.tsx).
//
// Policy: Punch In and Punch Out are both required every working day. Punch Out is gated
// so a full day is served before it unlocks: 8h 45m after an on-time Punch In (before
// 10:00am IST), or 6:45pm IST for a late Punch In. A day is Present when the engineer
// punched in by 10:00am IST and punched out. These deviations are handled specially:
//   - Late In: Punch In at/after 10:00am IST. TODAY it reads "Punched in Late" (a
//     provisional state, latePending); once the day is past it becomes Absent (Late In)
//     until the engineer's amendment is approved.
//   - Single Punch: Punch In with no Punch Out by the time the day rolls over -> Absent.
//   - No Show: never punched in (computed on read, no row) -> Absent.
//   - Short Hours: legacy cause (the pre-gate < 6h rule). No longer produced now that
//     Punch Out is gated, but old rows with short_hours/early_out set still read Absent.
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
// Punch Out policy: an on-time check-in (before 10:00) must complete 8h45m before Punch
// Out unlocks; a late check-in (>=10:00) can Punch Out from 6:45 PM IST the same day.
const FULL_DAY_MIN = 8 * 60 + 45 // 8h 45m required after an on-time Punch In

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

// The instant Punch Out becomes available for a given Punch In:
//  - on-time (before 10:00 AM): 8h 45m after Punch In
//  - late (>= 10:00 AM): 6:45 PM IST the same calendar day
export function punchOutEnableAt(markedAtIso: string, istDateStr: string): Date {
  return isPastAttendanceCutoff(new Date(markedAtIso))
    ? new Date(`${istDateStr}T18:45:00+05:30`)
    : new Date(new Date(markedAtIso).getTime() + FULL_DAY_MIN * 60000)
}

function formatISTTime(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit' }).format(d)
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
  day_off: boolean
  reason: string | null
  marked_at: string | null
  place_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  late_in: boolean
  early_out: boolean
  single_punch: boolean
  short_hours: boolean
  // Punch-in work category + visit details (null for HQ / old rows).
  punch_category: PunchCategory | null
  visit_customer_name: string | null
  visit_site_address: string | null
  visit_purpose: string | null
  // Only selected by callers that need it (e.g. getAttendanceCalendarCore) — optional
  // since computeEffectiveStatus itself never reads these.
  end_day_at?: string | null
  end_day_place_name?: string | null
}

// Work category chosen at punch-in (v2, hierarchical). HQ needs no visit details; every
// other category collects customer/site/purpose. Travel and Site Visit each carry one of
// four sub-types, encoded into the combined key. Legacy v1 keys (travel_r/nr, site_r/nr)
// remain for historical rows. Each key maps to a colour in the attendance views.
export type PunchCategory =
  | 'hq' | 'business_dev' | 'others'
  | 'travel_recoverable' | 'travel_non_recoverable' | 'travel_nfpfs_installation' | 'travel_nfpfs_commissioning'
  | 'site_recoverable' | 'site_non_recoverable' | 'site_nfpfs_installation' | 'site_nfpfs_commissioning'
  | 'travel_r' | 'travel_nr' | 'site_r' | 'site_nr'

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
  // A late (>= 10:00) punch-in TODAY that isn't approved yet: shows "Punched in Late"
  // (a provisional state) rather than Present or Absent. Once the day rolls over it is
  // no longer latePending and reads Absent (Late In) until approved.
  latePending: boolean
  approvedByName: string | null
  approvedAt: string | null
  markedAt: string | null
  placeName: string | null
  endDayAt: string | null
  endDayPlaceName: string | null
  // Punch-in work category + visit details (null when not a punch-in day / HQ).
  punchCategory: PunchCategory | null
  visitCustomerName: string | null
  visitSiteAddress: string | null
  visitPurpose: string | null
  // When Punch Out unlocks for today's not-yet-punched-out day: 8h45m after an on-time
  // Punch In, or 6:45 PM IST for a late Punch In. Null once punched out or on past days.
  endDayEnableAt: string | null
}

export type AttendanceEffectiveStatus =
  | { kind: 'holiday'; name: string }
  | { kind: 'day_off'; pendingApproval: boolean; rejected: boolean; name: string | null }
  // A non-working day with no punch-in: a Sunday weekly-off, or a date inside an
  // approved Apply-for-Leave range. Both read as "Leave" in the UI; `approvedLeave`
  // distinguishes an approved leave ("On Leave") from the automatic Sunday off.
  | { kind: 'off'; name: string; approvedLeave: boolean }
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
  // Item 1: a Sunday is a non-working "Weekly Off" UNLESS the engineer has a notification
  // scheduled that day (then it's a normal working day — Absent if they don't punch in).
  hasScheduledNotification?: boolean
  // Items 3/4: the date falls inside an approved leave range. Reads "On Leave" unless the
  // engineer punches in that day (a site visit during leave), in which case the punch row
  // wins below and the day shows Site Visit/Travel.
  onApprovedLeave?: boolean
}): AttendanceEffectiveStatus {
  const { dateStr, todayStr, row, holidayName, profileCreatedAtDateStr, hasScheduledNotification = false, onApprovedLeave = false } = params
  const isSunday = new Date(dateStr + 'T00:00:00Z').getUTCDay() === 0

  // A voluntary Day Off (Sunday/holiday auto-approved, other days pending) takes
  // precedence over the punch-based derivation — the row carries no punch times.
  if (row?.day_off) {
    return {
      kind: 'day_off',
      pendingApproval: row.approval_status === 'pending',
      rejected: row.approval_status === 'rejected',
      name: holidayName || null,
    }
  }

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

    const isToday = dateStr === todayStr
    // Punch Out unlock time for today's not-yet-punched-out day (null otherwise).
    const endDayEnableAt = (isToday && row.marked_at && !row.end_day_at)
      ? punchOutEnableAt(row.marked_at, todayStr).toISOString()
      : null

    const common: AttendanceDay = {
      reason: row.reason,
      pendingApproval: pending,
      rejected,
      amended: approved,
      lateIn,
      earlyOut: shortHours,
      singlePunch,
      noShow: false,
      latePending: false,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      markedAt: row.marked_at,
      placeName: row.place_name,
      endDayAt: row.end_day_at ?? null,
      endDayPlaceName: row.end_day_place_name ?? null,
      punchCategory: row.punch_category ?? null,
      visitCustomerName: row.visit_customer_name ?? null,
      visitSiteAddress: row.visit_site_address ?? null,
      visitPurpose: row.visit_purpose ?? null,
      endDayEnableAt,
    }

    // Approved amendment = Present. A late Punch In stays provisional: TODAY it reads
    // "Punched in Late" (kind 'leave' + latePending) rather than Present or Absent; once
    // the day is past it becomes plain Absent (Late In) until approved. Every other
    // unresolved cause (short hours / single punch), or a pending/rejected amendment, is
    // Absent. A clean on-time full day with no pending request is Present.
    if (approved) return { kind: 'present', ...common }
    if (lateIn) return { kind: 'leave', ...common, latePending: isToday }
    if (pending || rejected) return { kind: 'leave', ...common }
    if (hasCause) return { kind: 'leave', ...common }
    return { kind: 'present', ...common }
  }

  if (holidayName) return { kind: 'holiday', name: holidayName }
  if (profileCreatedAtDateStr && dateStr < profileCreatedAtDateStr) return { kind: 'not_applicable' }

  // Approved leave with no punch-in reads "On Leave". (A punch-in on a leave day was
  // already handled above — the row wins, so a site visit during leave shows Site
  // Visit/Travel for that date.)
  //
  // IMPORTANT — backward-compat: return the existing 'holiday' kind (not a new 'off'
  // kind) so that older installed apps, which don't know 'off', render this gracefully
  // as "Holiday: <name>" instead of crashing (they read status.kind through an
  // exhaustive switch with no 'off' case). 'holiday' has the same "non-working, not
  // absent" semantics we want for a weekly off / approved leave, and still permits
  // punch-in (canPunchIn includes the holiday kind). See [[project_mobile_backcompat]].
  if (onApprovedLeave) return { kind: 'holiday', name: 'On Leave' }

  // A Sunday with no scheduled notification (and no punch-in) is the automatic Weekly
  // Off. A Sunday that DOES have a scheduled notification falls through to the normal
  // working-day path below (Absent if the engineer never punches in).
  if (isSunday && !hasScheduledNotification) return { kind: 'holiday', name: 'Weekly Off' }

  const absentNoShow = (): AttendanceEffectiveStatus => ({
    kind: 'leave', reason: null, pendingApproval: false, rejected: false, amended: false,
    lateIn: false, earlyOut: false, singlePunch: false, noShow: true, latePending: false,
    approvedByName: null, approvedAt: null, markedAt: null, placeName: null,
    endDayAt: null, endDayPlaceName: null,
    punchCategory: null, visitCustomerName: null, visitSiteAddress: null, visitPurpose: null,
    endDayEnableAt: null,
  })

  if (dateStr === todayStr) {
    // Before 10 AM with no punch-in: still on time to punch in. After 10 AM: the day is
    // provisionally Absent, but punch-in stays open (a late punch-in then applies).
    return isPastAttendanceCutoff() ? absentNoShow() : { kind: 'pending' }
  }
  if (dateStr < todayStr) return absentNoShow() // a past day with no punch-in is Absent
  return { kind: 'not_applicable' } // future date
}

// 'YYYY-MM-DD' + n days, staying on the date-only (UTC) calendar.
function addDaysStr(dateStr: string, n: number): string {
  const dt = new Date(dateStr + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

// Item 1 signal — the set of dates in [fromStr, toStr] on which an engineer has a
// notification scheduled (primary engineer_id OR an additional-engineer assignment).
// A scheduled notification turns a Sunday into a normal working day.
export async function getScheduledNotificationDates(admin: AdminClient, engineerId: string, fromStr: string, toStr: string): Promise<Set<string>> {
  const { data: assigns } = await admin.from('work_order_engineer_assignments').select('work_order_id').eq('engineer_id', engineerId)
  const extraIds = [...new Set((assigns || []).map(a => a.work_order_id))]
  const queries = [
    admin.from('work_orders').select('scheduled_date').eq('engineer_id', engineerId).gte('scheduled_date', fromStr).lte('scheduled_date', toStr),
  ]
  if (extraIds.length) queries.push(admin.from('work_orders').select('scheduled_date').in('id', extraIds).gte('scheduled_date', fromStr).lte('scheduled_date', toStr))
  const results = await Promise.all(queries)
  const dates = new Set<string>()
  results.forEach(({ data }) => (data || []).forEach(r => { if (r.scheduled_date) dates.add(r.scheduled_date) }))
  return dates
}

// Items 3/4 signal — the set of dates in [fromStr, toStr] the engineer is on APPROVED
// leave (Apply-for-Leave). Only approved requests affect the attendance view.
export async function getApprovedLeaveDates(admin: AdminClient, engineerId: string, fromStr: string, toStr: string): Promise<Set<string>> {
  const { data } = await admin.from('leave_requests')
    .select('from_date, to_date').eq('engineer_id', engineerId).eq('status', 'approved')
    .lte('from_date', toStr).gte('to_date', fromStr)
  const dates = new Set<string>()
  ;(data || []).forEach(lr => {
    let d = lr.from_date < fromStr ? fromStr : lr.from_date
    const end = lr.to_date > toStr ? toStr : lr.to_date
    while (d <= end) { dates.add(d); d = addDaysStr(d, 1) }
  })
  return dates
}

// Batch variants for the desktop overview (all engineers at once). Return one date set
// per engineer id; an engineer with no rows simply isn't a key (treated as empty).
export async function getScheduledNotificationDatesByEngineer(admin: AdminClient, engineerIds: string[], fromStr: string, toStr: string): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {}
  if (!engineerIds.length) return out
  const [{ data: primary }, { data: assigns }] = await Promise.all([
    admin.from('work_orders').select('engineer_id, scheduled_date').in('engineer_id', engineerIds).gte('scheduled_date', fromStr).lte('scheduled_date', toStr),
    admin.from('work_order_engineer_assignments').select('engineer_id, work_order_id').in('engineer_id', engineerIds),
  ])
  ;(primary || []).forEach(r => { if (r.engineer_id && r.scheduled_date) (out[r.engineer_id] ??= new Set()).add(r.scheduled_date) })
  const woIds = [...new Set((assigns || []).map(a => a.work_order_id))]
  if (woIds.length) {
    const { data: extraWo } = await admin.from('work_orders').select('id, scheduled_date').in('id', woIds).gte('scheduled_date', fromStr).lte('scheduled_date', toStr)
    const dateByWo: Record<string, string> = {}
    ;(extraWo || []).forEach(w => { if (w.scheduled_date) dateByWo[w.id] = w.scheduled_date })
    ;(assigns || []).forEach(a => { const d = dateByWo[a.work_order_id]; if (a.engineer_id && d) (out[a.engineer_id] ??= new Set()).add(d) })
  }
  return out
}

export async function getApprovedLeaveDatesByEngineer(admin: AdminClient, engineerIds: string[], fromStr: string, toStr: string): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {}
  if (!engineerIds.length) return out
  const { data } = await admin.from('leave_requests')
    .select('engineer_id, from_date, to_date').in('engineer_id', engineerIds).eq('status', 'approved')
    .lte('from_date', toStr).gte('to_date', fromStr)
  ;(data || []).forEach(lr => {
    if (!lr.engineer_id) return
    const set = (out[lr.engineer_id] ??= new Set())
    let d = lr.from_date < fromStr ? fromStr : lr.from_date
    const end = lr.to_date > toStr ? toStr : lr.to_date
    while (d <= end) { set.add(d); d = addDaysStr(d, 1) }
  })
  return out
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
      if (s.latePending) return s.pendingApproval ? 'Punched in Late (pending approval)' : s.rejected ? 'Punched in Late (amendment rejected)' : 'Punched in Late'
      if (s.noShow) return s.pendingApproval ? 'Absent (pending approval)' : s.rejected ? 'Absent (amendment rejected)' : 'Absent'
      const flags: string[] = []
      if (s.lateIn) flags.push('Late In')
      if (s.earlyOut) flags.push('Short Hours')
      if (s.singlePunch) flags.push('Single Punch')
      const decision = s.rejected ? 'rejected' : s.pendingApproval ? 'pending approval' : null
      return `Absent (${flags.join(', ')}${decision ? ` — ${decision}` : ''})`
    }
    case 'holiday': return `Holiday: ${s.name}`
    case 'day_off': return s.name ? `Day Off: ${s.name}` : s.pendingApproval ? 'Day Off (pending approval)' : s.rejected ? 'Day Off (rejected)' : 'Day Off'
    case 'off': return s.approvedLeave ? 'On Leave' : s.name
    case 'pending': return 'Pending'
    case 'not_applicable': return '—'
  }
}

async function getProfileCreatedAtDateStr(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('created_at').eq('id', userId).maybeSingle()
  return data?.created_at ? getISTDateStr(new Date(data.created_at)) : null
}

const ATTENDANCE_ROW_COLUMNS = 'status, approval_status, day_off, reason, marked_at, place_name, approved_by, approved_at, late_in, early_out, single_punch, short_hours, end_day_at, end_day_place_name, punch_category, visit_customer_name, visit_site_address, visit_purpose'

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
    const [{ data: row }, { data: holiday }, profileCreatedAtDateStr, scheduledDates, leaveDates] = await Promise.all([
      admin.from('attendance').select(ATTENDANCE_ROW_COLUMNS).eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle(),
      admin.from('holidays').select('name').eq('holiday_date', todayStr).maybeSingle(),
      getProfileCreatedAtDateStr(admin, userId),
      getScheduledNotificationDates(admin, userId, todayStr, todayStr),
      getApprovedLeaveDates(admin, userId, todayStr, todayStr),
    ])

    const nameByApprover = await resolveApprovedByNames(admin, [row?.approved_by ?? null])
    const rowWithName: AttendanceRowCore | null = row ? { ...row, approved_by_name: row.approved_by ? nameByApprover[row.approved_by] ?? null : null } : null

    const status = computeEffectiveStatus({
      dateStr: todayStr, todayStr, row: rowWithName, holidayName: holiday?.name ?? null, profileCreatedAtDateStr,
      hasScheduledNotification: scheduledDates.has(todayStr), onApprovedLeave: leaveDates.has(todayStr),
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
  category?: PunchCategory | null
  visitCustomerName?: string | null
  visitSiteAddress?: string | null
  visitPurpose?: string | null
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const targetDateStr = params.attendanceDate ?? todayStr

    if (targetDateStr !== todayStr) {
      return { error: 'Punch In is only available for today. Use Request Amendment for a past day.', needsApproval: false }
    }

    // Work category is required; every category except HQ also needs visit details.
    const category = params.category ?? null
    const VALID: PunchCategory[] = [
      'hq', 'business_dev', 'others',
      'travel_recoverable', 'travel_non_recoverable', 'travel_nfpfs_installation', 'travel_nfpfs_commissioning',
      'site_recoverable', 'site_non_recoverable', 'site_nfpfs_installation', 'site_nfpfs_commissioning',
      // Legacy v1 keys — older installed app builds still send these, so keep accepting
      // them or those users can't punch in until they update.
      'travel_r', 'travel_nr', 'site_r', 'site_nr',
    ]
    if (!category || !VALID.includes(category)) {
      return { error: 'Choose what you are doing today before punching in.', needsApproval: false }
    }
    const customerName = params.visitCustomerName?.trim() || null
    const siteAddress = params.visitSiteAddress?.trim() || null
    const purpose = params.visitPurpose?.trim() || null
    if (category !== 'hq' && (!customerName || !siteAddress || !purpose)) {
      return { error: 'Customer name, site address and purpose of visit are all required.', needsApproval: false }
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
        day_off: false,
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
        punch_category: category,
        visit_customer_name: category === 'hq' ? null : customerName,
        visit_site_address: category === 'hq' ? null : siteAddress,
        visit_purpose: category === 'hq' ? null : purpose,
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

// Change today's punch-in work category AFTER punching in (the dashboard status
// chip). Unlike markAttendanceCore (which refuses a second punch), this only rewrites
// the category + visit details on the already-marked row — punch-in time, status and
// everything else are untouched.
export async function updatePunchCategoryCore(admin: AdminClient, userId: string, params: {
  category: PunchCategory | null
  visitCustomerName?: string | null
  visitSiteAddress?: string | null
  visitPurpose?: string | null
}): Promise<{ error: string | null }> {
  try {
    const todayStr = getISTDateStr()
    const category = params.category ?? null
    const VALID: PunchCategory[] = [
      'hq', 'business_dev', 'others',
      'travel_recoverable', 'travel_non_recoverable', 'travel_nfpfs_installation', 'travel_nfpfs_commissioning',
      'site_recoverable', 'site_non_recoverable', 'site_nfpfs_installation', 'site_nfpfs_commissioning',
      'travel_r', 'travel_nr', 'site_r', 'site_nr',
    ]
    if (!category || !VALID.includes(category)) {
      return { error: 'Choose a valid status.' }
    }
    const customerName = params.visitCustomerName?.trim() || null
    const siteAddress = params.visitSiteAddress?.trim() || null
    const purpose = params.visitPurpose?.trim() || null
    if (category !== 'hq' && (!customerName || !siteAddress || !purpose)) {
      return { error: 'Customer name, site address and purpose of visit are all required.' }
    }

    const { data: existing } = await admin.from('attendance')
      .select('id, marked_at')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()
    if (!existing?.marked_at) {
      return { error: 'Punch in first before setting your status.' }
    }

    const result = await withTimeout(
      admin.from('attendance').update({
        punch_category: category,
        visit_customer_name: category === 'hq' ? null : customerName,
        visit_site_address: category === 'hq' ? null : siteAddress,
        visit_purpose: category === 'hq' ? null : purpose,
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
    // Punch Out is gated: 8h45m after an on-time Punch In, or 6:45 PM IST for a late one.
    const enableAt = punchOutEnableAt(existing.marked_at, todayStr)
    if (now < enableAt) {
      const late = isPastAttendanceCutoff(new Date(existing.marked_at))
      return {
        error: late
          ? 'Punch Out opens at 6:45 PM. Please try again then.'
          : `Punch Out opens 8 hours 45 minutes after Punch In — at ${formatISTTime(enableAt)}.`,
        needsApproval: false,
      }
    }

    const result = await withTimeout(
      admin.from('attendance').update({
        end_day_at: now.toISOString(),
        end_day_latitude: params.latitude,
        end_day_longitude: params.longitude,
        end_day_place_name: params.placeName,
        short_hours: false,
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

// Date-only strings parse as UTC midnight, so getUTCDay reads the weekday of the IST
// calendar date itself without further timezone shifting.
function isSundayIST(istDateStr: string): boolean {
  return new Date(`${istDateStr}T00:00:00Z`).getUTCDay() === 0
}

// Voluntary Day Off for today. On a Sunday or a configured holiday it's accepted
// immediately (approval_status 'approved'); on any other weekday it goes to the Service
// Manager for approval (pending). Records no punch times. Blocked once the engineer has
// already punched in for the day.
export async function markDayOffCore(admin: AdminClient, userId: string, params: {
  attendanceDate?: string
}): Promise<{ error: string | null; needsApproval: boolean }> {
  try {
    const now = new Date()
    const todayStr = getISTDateStr(now)
    const targetDateStr = params.attendanceDate ?? todayStr
    if (targetDateStr !== todayStr) {
      return { error: 'Day Off can only be marked for today.', needsApproval: false }
    }

    const { data: existing } = await admin.from('attendance').select('id, marked_at, day_off, approval_status')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()
    if (existing?.marked_at) {
      return { error: "You've already punched in today, so it can't be marked as a day off.", needsApproval: false }
    }
    if (existing?.day_off && existing.approval_status !== 'rejected') {
      return {
        error: existing.approval_status === 'pending' ? 'Your day off is already pending approval.' : 'Today is already marked as a day off.',
        needsApproval: false,
      }
    }

    const { data: holiday } = await admin.from('holidays').select('name').eq('holiday_date', todayStr).maybeSingle()
    const holidayName = holiday?.name ?? null
    const autoOff = isSundayIST(todayStr) || !!holidayName
    const approvalStatus: 'approved' | 'pending' = autoOff ? 'approved' : 'pending'

    const result = await withTimeout(
      admin.from('attendance').upsert({
        engineer_id: userId,
        attendance_date: todayStr,
        status: 'present',
        day_off: true,
        marked_at: null,
        latitude: null,
        longitude: null,
        place_name: null,
        reason: holidayName || 'Day off',
        approval_status: approvalStatus,
        approved_by: null,
        approved_at: autoOff ? now.toISOString() : null,
        late_in: false,
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

    if (!autoOff && result.data?.id) {
      notifyUsers(admin, [
        { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
      ], {
        type: 'attendance_amendment_pending',
        title: 'Day off needs approval',
        body: `An engineer requested a day off for ${todayStr}.`,
        entityType: 'attendance', entityId: result.data.id,
        linkPath: '/attendance',
      }).catch(() => {})
    }

    return { error: null, needsApproval: !autoOff }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), needsApproval: false }
  }
}

// Lets an engineer undo their own Day Off for today (e.g. tapped by accident) — as long
// as it isn't already manager-approved and they haven't since punched in. Deletes the
// row so the day returns to a clean state and they can punch in normally.
export async function cancelDayOffCore(admin: AdminClient, userId: string, params: {
  attendanceDate?: string
}): Promise<{ error: string | null }> {
  try {
    const todayStr = getISTDateStr()
    const targetDateStr = params.attendanceDate ?? todayStr
    if (targetDateStr !== todayStr) return { error: 'You can only change today’s day off.' }

    const { data: existing } = await admin.from('attendance')
      .select('id, day_off, approval_status, marked_at')
      .eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()

    if (!existing || !existing.day_off || existing.marked_at) return { error: null } // nothing to cancel
    if (existing.approval_status === 'approved') {
      return { error: 'Your day off is already approved — ask your manager to change it.' }
    }

    const result = await withTimeout(admin.from('attendance').delete().eq('id', existing.id), 8000)
    if (!result) return { error: 'Saving is taking longer than expected — please check your connection and try again.' }
    if (result.error) return { error: result.error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
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

    const [{ data: rows }, { data: holidays }, profileCreatedAtDateStr, scheduledDates, leaveDates] = await Promise.all([
      admin.from('attendance').select(`attendance_date, ${ATTENDANCE_ROW_COLUMNS}`).eq('engineer_id', userId).gte('attendance_date', from).lte('attendance_date', to),
      admin.from('holidays').select('holiday_date, name').gte('holiday_date', from).lte('holiday_date', to),
      getProfileCreatedAtDateStr(admin, userId),
      getScheduledNotificationDates(admin, userId, from, to),
      getApprovedLeaveDates(admin, userId, from, to),
    ])

    const nameByApprover = await resolveApprovedByNames(admin, (rows || []).map(r => r.approved_by))
    const rowByDate: Record<string, AttendanceRowCore> = {}
    ;(rows || []).forEach(r => { rowByDate[r.attendance_date] = { ...r, approved_by_name: r.approved_by ? nameByApprover[r.approved_by] ?? null : null } })
    const holidayByDate: Record<string, string> = {}
    ;(holidays || []).forEach(h => { holidayByDate[h.holiday_date] = h.name })

    const days: AttendanceCalendarDay[] = eachDateStr(from, to).map(dateStr => ({
      date: dateStr,
      status: computeEffectiveStatus({ dateStr, todayStr, row: rowByDate[dateStr] ?? null, holidayName: holidayByDate[dateStr] ?? null, profileCreatedAtDateStr, hasScheduledNotification: scheduledDates.has(dateStr), onApprovedLeave: leaveDates.has(dateStr) }),
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
  dayOff: boolean
}

export async function getPendingAmendmentsCore(admin: AdminClient): Promise<{ amendments: PendingAmendment[]; error: string | null }> {
  try {
    await resolveOverdueSinglePunches(admin)

    const { data: rows, error } = await admin.from('attendance')
      .select('id, engineer_id, attendance_date, reason, marked_at, place_name, late_in, early_out, single_punch, day_off')
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
      lateIn: r.late_in, earlyOut: r.early_out, singlePunch: r.single_punch, dayOff: r.day_off,
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

// ----- Apply for Leave (items 3 & 4) --------------------------------------------------
// A date-range leave request the engineer submits for manager approval. Distinct from a
// same-day voluntary Day Off (markDayOffCore) and from an attendance amendment. Only an
// APPROVED range turns its dates into "On Leave" in the attendance views (unless the
// engineer punches in that day — a site visit during leave, which the punch row wins).

export interface LeaveRequestItem {
  id: string
  engineerId: string
  engineerName: string
  fromDate: string
  toDate: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
}

export async function applyForLeaveCore(admin: AdminClient, userId: string, params: {
  fromDate: string
  toDate: string
  reason: string
}): Promise<{ error: string | null }> {
  try {
    const fromDate = params.fromDate
    const toDate = params.toDate
    const reason = params.reason?.trim()
    if (!fromDate || !toDate) return { error: 'Choose both a From and To date.' }
    if (toDate < fromDate) return { error: 'The To date must be on or after the From date.' }
    if (!reason) return { error: 'A reason is required.' }

    // Block overlapping requests that are still pending or already approved.
    const { data: clashes } = await admin.from('leave_requests')
      .select('id').eq('engineer_id', userId).in('status', ['pending', 'approved'])
      .lte('from_date', toDate).gte('to_date', fromDate).limit(1)
    if (clashes && clashes.length) return { error: 'You already have a leave request covering those dates.' }

    const { data: inserted, error } = await admin.from('leave_requests').insert({
      engineer_id: userId, from_date: fromDate, to_date: toDate, reason, status: 'pending',
    }).select('id').single()
    if (error) return { error: error.message }

    if (inserted?.id) {
      notifyUsers(admin, [
        { role: 'Service Manager' as const }, { role: 'Head of Service' as const }, { role: 'Super Admin' as const },
      ], {
        type: 'leave_request_pending',
        title: 'Leave request needs approval',
        body: `An engineer applied for leave from ${fromDate} to ${toDate}.`,
        entityType: 'leave_request', entityId: inserted.id,
        linkPath: '/attendance',
      }).catch(() => {})
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMyLeaveRequestsCore(admin: AdminClient, userId: string): Promise<{ requests: LeaveRequestItem[]; error: string | null }> {
  try {
    const { data, error } = await admin.from('leave_requests')
      .select('id, engineer_id, from_date, to_date, reason, status, approved_by, approved_at, created_at')
      .eq('engineer_id', userId).order('created_at', { ascending: false }).limit(50)
    if (error) return { requests: [], error: error.message }

    const nameByApprover = await resolveApprovedByNames(admin, (data || []).map(r => r.approved_by))
    const requests: LeaveRequestItem[] = (data || []).map(r => ({
      id: r.id, engineerId: r.engineer_id, engineerName: '',
      fromDate: r.from_date, toDate: r.to_date, reason: r.reason, status: r.status,
      approvedByName: r.approved_by ? nameByApprover[r.approved_by] ?? null : null,
      approvedAt: r.approved_at, createdAt: r.created_at,
    }))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getPendingLeaveRequestsCore(admin: AdminClient): Promise<{ requests: LeaveRequestItem[]; error: string | null }> {
  try {
    const { data, error } = await admin.from('leave_requests')
      .select('id, engineer_id, from_date, to_date, reason, status, approved_by, approved_at, created_at')
      .eq('status', 'pending').order('created_at', { ascending: false })
    if (error) return { requests: [], error: error.message }

    const engineerIds = [...new Set((data || []).map(r => r.engineer_id))]
    const { data: profiles } = engineerIds.length
      ? await admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] }
    const nameById: Record<string, string> = {}
    ;(profiles || []).forEach(p => { nameById[p.id] = `${p.first_name} ${p.last_name}` })

    const requests: LeaveRequestItem[] = (data || []).map(r => ({
      id: r.id, engineerId: r.engineer_id, engineerName: nameById[r.engineer_id] || 'Engineer',
      fromDate: r.from_date, toDate: r.to_date, reason: r.reason, status: r.status,
      approvedByName: null, approvedAt: r.approved_at, createdAt: r.created_at,
    }))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function approveRejectLeaveCore(admin: AdminClient, managerId: string, leaveRequestId: string, decision: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  try {
    const { data: row } = await admin.from('leave_requests').select('engineer_id, from_date, to_date').eq('id', leaveRequestId).maybeSingle()
    if (!row) return { error: 'Leave request not found' }

    const { error } = await admin.from('leave_requests').update({
      status: decision, approved_by: managerId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', leaveRequestId)
    if (error) return { error: error.message }

    const { data: manager } = await admin.from('profiles').select('first_name, last_name').eq('id', managerId).maybeSingle()
    const managerName = manager ? `${manager.first_name} ${manager.last_name}` : 'Your manager'
    notifyUsers(admin, [{ userId: row.engineer_id }], {
      type: 'leave_request_decided',
      title: decision === 'approved' ? 'Leave request approved' : 'Leave request rejected',
      body: `${managerName} ${decision} your leave from ${row.from_date} to ${row.to_date}.`,
      entityType: 'leave_request', entityId: leaveRequestId,
      linkPath: '/mobile/attendance',
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
