'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getISTDateStr } from '@/lib/mobile/core/attendance'

// Field Engineers / Live Map status mirrors the engineer's attendance exactly — the
// punch-in category they recorded (HQ / Travel / Site Visit / Business Dev / Others),
// On Leave, or Present (marked in with no category) — never a derived "Available" /
// "Unavailable". 'absent' and 'present' are read-time results, not stored values (see
// resolveDisplayStatus). 'available'/'unavailable' are retained in the union only for
// backward compatibility and are no longer produced.
export type EngineerStatus = 'available' | 'unavailable' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed'
  | 'hq' | 'business_dev' | 'travel' | 'site_visit' | 'others' | 'absent' | 'present'

// "Reached project" only holds while the engineer is actually near the project site;
// beyond this they read as Available (they've evidently moved on / weren't there).
const AT_PROJECT_KM = 2

// Great-circle distance in km (Haversine).
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Stored punch_category (e.g. 'travel_recoverable', 'site_nfpfs_installation') → the
// top-level activity token shown as the Live Map badge.
function topPunchToken(cat: string | null | undefined): Extract<EngineerStatus, 'hq' | 'business_dev' | 'travel' | 'site_visit' | 'others'> | null {
  if (!cat) return null
  if (cat === 'hq') return 'hq'
  if (cat === 'business_dev') return 'business_dev'
  if (cat.startsWith('travel')) return 'travel'
  if (cat.startsWith('site')) return 'site_visit'
  if (cat === 'others') return 'others'
  return null
}

// Resolve one attendance row (today's or a previous day's) into the exact status to
// display: Leave, the punch-in category, or "Present" (marked in with no category).
// Returns null when there's no usable row.
function attendanceRowToStatus(row: { status: string | null; marked_at?: string | null; punch_category: string | null } | null | undefined): EngineerStatus | null {
  if (!row) return null
  if (row.status === 'leave') return 'on_leave'
  if (row.status === 'present' || row.marked_at) return topPunchToken(row.punch_category) ?? 'present'
  return null
}

// Badge precedence (per product decision 2026-10-07 — show the exact attendance status,
// never Available/Unavailable):
//   1. A live job-workflow status set *today* (On the way / Travelling / Reached /
//      Completed) still wins while it's current — it's the most up-to-date field signal
//      and isn't an attendance category. "Reached" reverts to the attendance base once
//      the engineer has clearly left the project site.
//   2. Today's attendance: On Leave, or the punch-in category (HQ / Travel / Site Visit /
//      Business Dev / Others), falling back to "Present" when marked in with no category.
//   3. Not marked yet today: before 10 AM IST, carry the previous day's status forward;
//      from 10 AM IST onward (or with no prior record at all) → Absent.
function resolveDisplayStatus(params: {
  rawStatus: string | null
  statusUpdatedAt: string | null
  istTodayStr: string
  reachedAtProject: boolean
  todayRow: { status: string | null; marked_at: string | null; punch_category: string | null } | null
  prevDayStatus: EngineerStatus | null
  istHour: number
}): EngineerStatus {
  const { rawStatus, statusUpdatedAt, istTodayStr, reachedAtProject, todayRow, prevDayStatus, istHour } = params
  // A status set on a previous day (e.g. "Reached project" left over from yesterday
  // evening) is stale — only a status set today (IST) is treated as live.
  const statusSetToday = statusUpdatedAt != null && getISTDateStr(new Date(statusUpdatedAt)) === istTodayStr
  if (statusSetToday) {
    if (rawStatus === 'on_the_way' || rawStatus === 'travelling' || rawStatus === 'completed') return rawStatus
    if (rawStatus === 'reached' && reachedAtProject) return 'reached'
  }
  const todayStatus = attendanceRowToStatus(todayRow)
  if (todayStatus) return todayStatus
  if (rawStatus === 'on_leave' && statusSetToday) return 'on_leave'
  if (istHour < 10 && prevDayStatus) return prevDayStatus
  return 'absent'
}

export interface FieldEngineerOverview {
  id: string
  name: string
  employee_id: string
  phone: string | null
  status: EngineerStatus
  // Site name the status refers to, for on_the_way / travelling / reached / completed.
  statusSiteName: string | null
  // "I will start by ___" commitment, set alongside on_the_way/travelling — null once
  // status changes to anything else.
  statusStartBy: string | null
  statusUpdatedAt: string | null
  lastActiveAt: string | null
  // Whichever is more recent: the passive app-open location ping, or the last job
  // check-in — both are just "where was this engineer last known to be". lat/lng are
  // null on the rare fallback branch (last_active_at heartbeat with no GPS-tagged
  // signal at all — e.g. location permission was denied).
  lastSeen: { placeName: string | null; at: string; lat: number | null; lng: number | null; fresh: boolean } | null
  // The check-in immediately before the one lastSeen is based on (e.g. the previous
  // job site) — null if there's no earlier check-in on record. Shown on the Live Map
  // pin alongside the current position, purely informational (not rendered as its
  // own marker).
  previousSeen: { placeName: string | null; at: string; lat: number; lng: number } | null
  nextAssigned: { customerName: string; scheduledDate: string | null; woNumber: string } | null
  // Every open, scheduled notification the engineer has, earliest first — the Live Map
  // lists them all (with Today/Tomorrow/date prefixes) rather than only the nearest.
  nextNotifications: { woNumber: string; scheduledDate: string | null; customerName: string }[]
  openWorkOrders: number
  completedToday: number
  // Customer of an open work order scheduled for today, if any — overrides the
  // "Available" status label in the UI to "Scheduled to X" so an engineer with a job
  // lined up today doesn't read as free just because they haven't started travel yet.
  // Distinct from `nextAssigned`, which picks the *earliest* open scheduled_date
  // (could be an older overdue job) rather than specifically today's.
  scheduledTodayCustomer: string | null
}

export async function getFieldEngineersOverview(): Promise<{ engineers: FieldEngineerOverview[]; error: string | null }> {
  try {
    const admin = adminClient()

    const PROFILE_COLS = 'id, first_name, last_name, employee_id, display_order, phone, last_active_at, engineer_status, engineer_status_work_order_id, engineer_status_updated_at, engineer_status_start_by, last_seen_lat, last_seen_lng, last_seen_place_label, last_seen_at'

    // Build the roster from real activity (assigned work orders, site check-ins) rather
    // than filtering profiles by an exact role name — a role string that doesn't match
    // literally ("Field Engineer") would otherwise make real engineers vanish entirely.
    const [{ data: roleProfiles, error: profErr }, { data: assignedRows }, { data: checkinRows }] = await Promise.all([
      admin.from('profiles').select(PROFILE_COLS).eq('role', 'Field Engineer'),
      admin.from('work_orders').select('engineer_id').not('engineer_id', 'is', null),
      admin.from('work_order_checkins').select('engineer_id'),
    ])
    if (profErr) return { engineers: [], error: profErr.message }

    const activityIds = new Set<string>()
    ;(assignedRows || []).forEach(r => { if (r.engineer_id) activityIds.add(r.engineer_id) })
    ;(checkinRows || []).forEach(r => { if (r.engineer_id) activityIds.add(r.engineer_id) })

    const roleProfileIds = new Set((roleProfiles || []).map(p => p.id))
    const missingIds = [...activityIds].filter(id => !roleProfileIds.has(id))

    const { data: extraProfiles } = missingIds.length
      ? await admin.from('profiles').select(PROFILE_COLS).in('id', missingIds)
      : { data: [] as typeof roleProfiles }

    // Default order follows the roster (profiles.display_order, same as the Attendance
    // page); engineers without a roster position fall to the end, alphabetical. The
    // Field Engineers table's own column headers still re-sort client-side on demand.
    const profiles = [...(roleProfiles || []), ...(extraProfiles || [])].sort((a, b) => {
      const ao = (a as { display_order?: number | null }).display_order
      const bo = (b as { display_order?: number | null }).display_order
      if (ao != null && bo != null) return ao - bo
      if (ao != null) return -1
      if (bo != null) return 1
      return a.first_name.localeCompare(b.first_name)
    })
    if (!profiles.length) return { engineers: [], error: null }

    const engineerIds = profiles.map(p => p.id)
    const istTodayStr = getISTDateStr()
    // Lower bound for the "previous day" lookup (last 30 IST days) so an engineer who
    // simply hasn't punched in yet today shows their most recent prior attendance status
    // rather than jumping straight to a derived state — bounded so the query stays small.
    const istThirtyAgoStr = getISTDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

    const [{ data: wos }, { data: checkins }, { data: presentRows }, { data: prevAttendanceRows }] = await Promise.all([
      admin.from('work_orders')
        .select('id, wo_number, job_type, status, scheduled_date, customer_id, engineer_id, updated_at')
        .in('engineer_id', engineerIds),
      // Only the most recent checkin per engineer is used (first match wins in the
      // dedup below) — capped at 500 like the equivalent query in
      // getAssignableEngineers() (get-work-orders.ts), instead of scanning every
      // checkin ever logged org-wide on every Dashboard/Field Engineers page load.
      admin.from('work_order_checkins')
        .select('engineer_id, place_name, checked_in_at, latitude, longitude')
        .in('engineer_id', engineerIds)
        .order('checked_in_at', { ascending: false })
        .limit(500),
      // Today's attendance rows (IST): drives the exact status badge (Leave / HQ / Travel
      // / Site Visit / Business Dev / Others / Present) and whether they've punched out.
      admin.from('attendance')
        .select('engineer_id, status, marked_at, end_day_at, punch_category')
        .eq('attendance_date', istTodayStr)
        .in('engineer_id', engineerIds),
      // Recent prior attendance (most recent first) — used, before 10 AM IST, to carry
      // the previous day's status forward until the engineer marks today's attendance.
      admin.from('attendance')
        .select('engineer_id, status, marked_at, punch_category, attendance_date')
        .lt('attendance_date', istTodayStr)
        .gte('attendance_date', istThirtyAgoStr)
        .in('engineer_id', engineerIds)
        .order('attendance_date', { ascending: false }),
    ])
    // One today-row per engineer (one attendance row per engineer per day).
    const todayRowByEng: Record<string, { status: string | null; marked_at: string | null; punch_category: string | null }> = {}
    ;(presentRows || []).forEach(r => { if (!todayRowByEng[r.engineer_id]) todayRowByEng[r.engineer_id] = { status: r.status, marked_at: r.marked_at, punch_category: r.punch_category } })
    // Engineers who have punched out for the day — a "Reached" badge then reverts to the
    // attendance base.
    const punchedOutTodayIds = new Set((presentRows || []).filter(r => r.end_day_at).map(r => r.engineer_id))
    // Previous day's resolved status per engineer (rows are ordered newest-first, so the
    // first one seen per engineer is their most recent prior attendance day).
    const prevDayStatusByEng: Record<string, EngineerStatus | null> = {}
    ;(prevAttendanceRows || []).forEach(r => {
      if (r.engineer_id in prevDayStatusByEng) return
      prevDayStatusByEng[r.engineer_id] = attendanceRowToStatus(r)
    })
    // IST hour right now — the 2km "left the site" check only kicks in after 6 PM, and
    // the "not marked yet" fallback shows the previous day's status only before 10 AM.
    const nowIstHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours()
    const afterSixPmIst = nowIstHour >= 18

    const customerIds = [...new Set((wos || []).map(w => w.customer_id))]
    const { data: customers } = customerIds.length
      ? await admin.from('customers').select('id, name').in('id', customerIds)
      : { data: [] as { id: string; name: string }[] }
    const custMap: Record<string, string> = {}
    customers?.forEach(c => { custMap[c.id] = c.name })

    // Site names for whichever work order each engineer's status currently points to
    // (On the way / Travelling / Reached) — same site_name convention used everywhere
    // else in this app: the transformer's customer_sites.site_name, falling back to
    // the customer's own name.
    const statusWoIds = [...new Set(profiles.map(p => p.engineer_status_work_order_id).filter(Boolean))] as string[]
    const { data: statusWotRowsRaw } = statusWoIds.length
      ? await admin.from('work_order_transformers').select('work_order_id, transformers(customer_sites(site_name, latitude, longitude))').in('work_order_id', statusWoIds)
      : { data: [] }
    type StatusWotRow = { work_order_id: string; transformers: { customer_sites: { site_name: string; latitude: number | null; longitude: number | null } | null } | null }
    const statusWotRows = (statusWotRowsRaw as unknown as StatusWotRow[]) || []
    const siteNameByWo: Record<string, string> = {}
    // Project site coordinates for the status work order — used to check whether a
    // "Reached" engineer is actually still at the project (≤2km) or has moved on.
    const siteCoordsByWo: Record<string, { lat: number; lng: number }> = {}
    statusWotRows.forEach(r => {
      const site = r.transformers?.customer_sites
      if (site?.site_name && !siteNameByWo[r.work_order_id]) siteNameByWo[r.work_order_id] = site.site_name
      if (site?.latitude != null && site?.longitude != null && !siteCoordsByWo[r.work_order_id]) {
        siteCoordsByWo[r.work_order_id] = { lat: site.latitude, lng: site.longitude }
      }
    })

    // Checkins per engineer, most recent first (checkins query is already ordered
    // desc) — [0] is their latest, [1] is the one immediately before it (exposed as
    // previousSeen below).
    const checkinsByEng: Record<string, { placeName: string | null; checkedInAt: string; lat: number | null; lng: number | null }[]> = {}
    for (const c of checkins || []) {
      const list = checkinsByEng[c.engineer_id] || (checkinsByEng[c.engineer_id] = [])
      list.push({ placeName: c.place_name, checkedInAt: c.checked_in_at, lat: c.latitude, lng: c.longitude })
    }
    const latestCheckinByEng: Record<string, { placeName: string | null; checkedInAt: string; lat: number | null; lng: number | null }> = {}
    Object.entries(checkinsByEng).forEach(([engId, list]) => { latestCheckinByEng[engId] = list[0] })

    const todayStr = new Date().toLocaleDateString('en-CA')

    const engineers: FieldEngineerOverview[] = profiles.map(p => {
      const theirWOs = (wos || []).filter(w => w.engineer_id === p.id)

      // The work order the engineer is actively engaged with right now (travelling to /
      // on the way to / already reached) — already fully represented by the status
      // badge itself ("Reached — X"), so it's excluded below to avoid "Next assigned
      // project" redundantly repeating the same project the badge already names.
      const activeStatusWoId = (p.engineer_status === 'on_the_way' || p.engineer_status === 'travelling' || p.engineer_status === 'reached')
        ? p.engineer_status_work_order_id
        : null

      // Nearest scheduled_date among anything still open (excluding the one already
      // shown via the status badge above) — not restricted to assigned/unassigned, so
      // this reflects what the engineer is actually busy with next, not just untouched
      // jobs.
      const upcoming = theirWOs
        .filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment' && w.scheduled_date && w.id !== activeStatusWoId)
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))[0]

      const statusWo = p.engineer_status_work_order_id ? theirWOs.find(w => w.id === p.engineer_status_work_order_id) : null
      const statusSiteName = p.engineer_status_work_order_id
        ? (siteNameByWo[p.engineer_status_work_order_id] || (statusWo ? custMap[statusWo.customer_id] : null) || null)
        : null

      const scheduledToday = theirWOs.find(w => w.scheduled_date === todayStr && w.status !== 'completed' && w.status !== 'needs_reassignment')

      const checkin = latestCheckinByEng[p.id]
      const pingAt = p.last_seen_at
      let lastSeen: { placeName: string | null; at: string; lat: number | null; lng: number | null; fresh: boolean } | null = null
      // Computed once here (server time) so the Live Map can decide freshness purely on
      // read without calling Date.now() during client render. Set per branch below.
      const markFresh = <T extends { at: string }>(v: T) => ({ ...v, fresh: Date.now() - new Date(v.at).getTime() <= 24 * 60 * 60 * 1000 })
      if (checkin && pingAt) {
        lastSeen = markFresh(new Date(pingAt) > new Date(checkin.checkedInAt)
          ? { placeName: p.last_seen_place_label, at: pingAt, lat: p.last_seen_lat, lng: p.last_seen_lng }
          : { placeName: checkin.placeName, at: checkin.checkedInAt, lat: checkin.lat, lng: checkin.lng })
      } else if (checkin) {
        lastSeen = markFresh({ placeName: checkin.placeName, at: checkin.checkedInAt, lat: checkin.lat, lng: checkin.lng })
      } else if (pingAt) {
        lastSeen = markFresh({ placeName: p.last_seen_place_label, at: pingAt, lat: p.last_seen_lat, lng: p.last_seen_lng })
      } else if (p.last_active_at) {
        // No check-in and no GPS-tagged ping (e.g. location permission was denied),
        // but the app-usage heartbeat still shows they were recently active — surface
        // that rather than showing "No location yet" for someone who clearly opened
        // the app today (this is the same last_active_at the Users page's Last Login
        // column falls back to, so the two should never visibly contradict each other).
        lastSeen = markFresh({ placeName: null, at: p.last_active_at, lat: null, lng: null })
      }

      // First earlier check-in (after the latest one already used above) that has
      // real coordinates — skips over any older rows with missing lat/lng rather
      // than giving up entirely on "previous location" for that engineer.
      const earlierCheckin = (checkinsByEng[p.id] || []).slice(1).find(c => c.lat != null && c.lng != null)
      const previousSeen = earlierCheckin
        ? { placeName: earlierCheckin.placeName, at: earlierCheckin.checkedInAt, lat: earlierCheckin.lat!, lng: earlierCheckin.lng! }
        : null

      // "Reached project" reverts to the attendance base once the engineer is clearly done there:
      //   - they've punched out for the day, OR
      //   - it's past 6 PM AND their last location is >2km from the project site
      //     (during the day, moving around / brief trips shouldn't flip it).
      // If the site has no coordinates on file, or there's no GPS fix, we can't disprove
      // the 2km case — so only punch-out flips it then.
      let reachedAtProject = true
      if (p.engineer_status === 'reached') {
        if (punchedOutTodayIds.has(p.id)) {
          reachedAtProject = false
        } else if (afterSixPmIst) {
          const siteCoords = p.engineer_status_work_order_id ? siteCoordsByWo[p.engineer_status_work_order_id] : null
          if (siteCoords && lastSeen?.lat != null && lastSeen?.lng != null) {
            reachedAtProject = distanceKm(lastSeen.lat, lastSeen.lng, siteCoords.lat, siteCoords.lng) <= AT_PROJECT_KM
          }
        }
      }

      // Every open, scheduled notification (earliest first) — the Live Map lists them all.
      const nextNotifications = theirWOs
        .filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment' && w.scheduled_date)
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))
        .map(w => ({ woNumber: w.wo_number, scheduledDate: w.scheduled_date, customerName: custMap[w.customer_id] || '' }))

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_id: p.employee_id,
        phone: p.phone,
        status: resolveDisplayStatus({ rawStatus: p.engineer_status, statusUpdatedAt: p.engineer_status_updated_at, istTodayStr, reachedAtProject, todayRow: todayRowByEng[p.id] ?? null, prevDayStatus: prevDayStatusByEng[p.id] ?? null, istHour: nowIstHour }),
        statusSiteName,
        statusStartBy: p.engineer_status_start_by,
        statusUpdatedAt: p.engineer_status_updated_at,
        lastActiveAt: p.last_active_at,
        lastSeen,
        previousSeen,
        nextAssigned: upcoming ? { customerName: custMap[upcoming.customer_id] || '', scheduledDate: upcoming.scheduled_date, woNumber: upcoming.wo_number } : null,
        nextNotifications,
        openWorkOrders: theirWOs.filter(w => w.status !== 'completed').length,
        completedToday: theirWOs.filter(w => w.status === 'completed' && w.updated_at && new Date(w.updated_at).toLocaleDateString('en-CA') === todayStr).length,
        scheduledTodayCustomer: scheduledToday ? (custMap[scheduledToday.customer_id] || null) : null,
      }
    })

    return { engineers, error: null }
  } catch (e: unknown) {
    return { engineers: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export interface EngineerProfileDetail {
  id: string
  name: string
  employeeId: string
  phone: string | null
  email: string | null
  grade: string | null
  role: string
  managerName: string | null
  status: EngineerStatus
  statusSiteName: string | null
  statusStartBy: string | null
  statusUpdatedAt: string | null
  lastSeen: { placeName: string | null; at: string } | null
  lastActiveAt: string | null
  scheduledTodayCustomer: string | null
}

export async function getEngineerProfile(id: string): Promise<{ profile: EngineerProfileDetail | null; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: p, error } = await admin.from('profiles')
      .select('id, first_name, last_name, employee_id, phone, email, grade, role, manager_id, engineer_status, engineer_status_work_order_id, engineer_status_start_by, engineer_status_updated_at, last_active_at, last_seen_place_label, last_seen_at')
      .eq('id', id).maybeSingle()
    if (error) return { profile: null, error: error.message }
    if (!p) return { profile: null, error: 'Engineer not found' }

    let managerName: string | null = null
    if (p.manager_id) {
      const { data: mgr } = await admin.from('profiles').select('first_name, last_name').eq('id', p.manager_id).maybeSingle()
      if (mgr) managerName = `${mgr.first_name} ${mgr.last_name}`
    }

    let statusSiteName: string | null = null
    if (p.engineer_status_work_order_id) {
      const { data: wotRows } = await admin.from('work_order_transformers')
        .select('transformers(customer_sites(site_name))')
        .eq('work_order_id', p.engineer_status_work_order_id)
      type Row = { transformers: { customer_sites: { site_name: string } | null } | null }
      statusSiteName = ((wotRows as unknown as Row[]) || []).map(r => r.transformers?.customer_sites?.site_name).find(Boolean) || null
    }

    // Same freshest-wins logic as getFieldEngineersOverview — the passive location
    // ping and the last job check-in are two independent "where were they last"
    // signals, falling back to the generic app-usage heartbeat if neither has GPS.
    const { data: checkinRows } = await admin.from('work_order_checkins')
      .select('place_name, checked_in_at').eq('engineer_id', id)
      .order('checked_in_at', { ascending: false }).limit(1)
    const checkin = checkinRows?.[0]
    const pingAt = p.last_seen_at
    let lastSeen: { placeName: string | null; at: string } | null = null
    if (checkin && pingAt) {
      lastSeen = new Date(pingAt) > new Date(checkin.checked_in_at)
        ? { placeName: p.last_seen_place_label, at: pingAt }
        : { placeName: checkin.place_name, at: checkin.checked_in_at }
    } else if (checkin) {
      lastSeen = { placeName: checkin.place_name, at: checkin.checked_in_at }
    } else if (pingAt) {
      lastSeen = { placeName: p.last_seen_place_label, at: pingAt }
    } else if (p.last_active_at) {
      lastSeen = { placeName: null, at: p.last_active_at }
    }

    // Same "Scheduled to X" override signal as getFieldEngineersOverview — an open
    // work order scheduled specifically for today, distinct from the general
    // notifications list already shown further down this page.
    const todayStr = new Date().toLocaleDateString('en-CA')
    const istTodayStr = getISTDateStr()
    const istThirtyAgoStr = getISTDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    const nowIstHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours()
    // Today's attendance row (any status, to catch Leave) + the most recent prior one —
    // same exact-attendance-status derivation as the Field Engineers / Live Map list.
    const [{ data: todayRow }, { data: prevRows }] = await Promise.all([
      admin.from('attendance')
        .select('status, marked_at, punch_category')
        .eq('engineer_id', id)
        .eq('attendance_date', istTodayStr)
        .maybeSingle(),
      admin.from('attendance')
        .select('status, marked_at, punch_category, attendance_date')
        .eq('engineer_id', id)
        .lt('attendance_date', istTodayStr)
        .gte('attendance_date', istThirtyAgoStr)
        .order('attendance_date', { ascending: false })
        .limit(1),
    ])
    const prevDayStatus = attendanceRowToStatus(prevRows?.[0])
    const { data: scheduledTodayRows } = await admin.from('work_orders')
      .select('customer_id')
      .eq('engineer_id', id)
      .eq('scheduled_date', todayStr)
      .neq('status', 'completed')
      .neq('status', 'needs_reassignment')
      .limit(1)
    let scheduledTodayCustomer: string | null = null
    if (scheduledTodayRows?.[0]) {
      const { data: cust } = await admin.from('customers').select('name').eq('id', scheduledTodayRows[0].customer_id).maybeSingle()
      scheduledTodayCustomer = cust?.name || null
    }

    return {
      profile: {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employeeId: p.employee_id,
        phone: p.phone,
        email: p.email,
        grade: p.grade,
        role: p.role,
        managerName,
        // Exact attendance status, same as the Field Engineers list / Live Map. No live
        // project-proximity check here, so a "Reached" status is taken at face value.
        status: resolveDisplayStatus({ rawStatus: p.engineer_status, statusUpdatedAt: p.engineer_status_updated_at, istTodayStr, reachedAtProject: true, todayRow: todayRow ?? null, prevDayStatus, istHour: nowIstHour }),
        statusSiteName,
        statusStartBy: p.engineer_status_start_by,
        statusUpdatedAt: p.engineer_status_updated_at,
        lastSeen,
        lastActiveAt: p.last_active_at,
        scheduledTodayCustomer,
      },
      error: null,
    }
  } catch (e: unknown) {
    return { profile: null, error: e instanceof Error ? e.message : String(e) }
  }
}
