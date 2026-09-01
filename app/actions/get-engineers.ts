'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getISTDateStr } from '@/lib/mobile/core/attendance'

// Explicit, engineer-set status (mobile app) — replaces the old heuristic derived
// from last_active_at + checkin/form-submission presence, which could only ever
// guess "on site" vs "off duty" and couldn't represent leave or travel at all.
// 'unavailable' is not a stored value — it's derived at read time for engineers who
// have no evidence of being on duty today (see resolveDisplayStatus).
export type EngineerStatus = 'available' | 'unavailable' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed'

// An engineer reads as "Available" only when there's real evidence they're on duty
// today: they marked attendance Present today, or they explicitly set their status to
// Available today. Otherwise the passive/never-set "available" default is shown as
// "Unavailable", so idle or absent engineers don't misleadingly read as free. The
// explicit work / leave statuses (on the way / travelling / reached / completed /
// on leave) always display as themselves.
function resolveDisplayStatus(rawStatus: string | null, statusUpdatedAt: string | null, presentToday: boolean, istTodayStr: string): EngineerStatus {
  if (rawStatus === 'on_the_way' || rawStatus === 'travelling' || rawStatus === 'reached' || rawStatus === 'completed' || rawStatus === 'on_leave') {
    return rawStatus
  }
  const setAvailableToday = rawStatus === 'available' && statusUpdatedAt != null && getISTDateStr(new Date(statusUpdatedAt)) === istTodayStr
  return presentToday || setAvailableToday ? 'available' : 'unavailable'
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
  lastSeen: { placeName: string | null; at: string; lat: number | null; lng: number | null } | null
  // The check-in immediately before the one lastSeen is based on (e.g. the previous
  // job site) — null if there's no earlier check-in on record. Shown on the Live Map
  // pin alongside the current position, purely informational (not rendered as its
  // own marker).
  previousSeen: { placeName: string | null; at: string; lat: number; lng: number } | null
  nextAssigned: { customerName: string; scheduledDate: string | null; woNumber: string } | null
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

    const PROFILE_COLS = 'id, first_name, last_name, employee_id, phone, last_active_at, engineer_status, engineer_status_work_order_id, engineer_status_updated_at, engineer_status_start_by, last_seen_lat, last_seen_lng, last_seen_place_label, last_seen_at'

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

    const profiles = [...(roleProfiles || []), ...(extraProfiles || [])].sort((a, b) => a.first_name.localeCompare(b.first_name))
    if (!profiles.length) return { engineers: [], error: null }

    const engineerIds = profiles.map(p => p.id)
    const istTodayStr = getISTDateStr()

    const [{ data: wos }, { data: checkins }, { data: presentRows }] = await Promise.all([
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
      // Who marked attendance Present today (IST) — gates whether the default
      // "available" status reads as Available vs Unavailable.
      admin.from('attendance')
        .select('engineer_id')
        .eq('attendance_date', istTodayStr)
        .eq('status', 'present')
        .in('engineer_id', engineerIds),
    ])
    const presentTodayIds = new Set((presentRows || []).map(r => r.engineer_id))

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
      ? await admin.from('work_order_transformers').select('work_order_id, transformers(customer_sites(site_name))').in('work_order_id', statusWoIds)
      : { data: [] }
    type StatusWotRow = { work_order_id: string; transformers: { customer_sites: { site_name: string } | null } | null }
    const statusWotRows = (statusWotRowsRaw as unknown as StatusWotRow[]) || []
    const siteNameByWo: Record<string, string> = {}
    statusWotRows.forEach(r => {
      const siteName = r.transformers?.customer_sites?.site_name
      if (siteName && !siteNameByWo[r.work_order_id]) siteNameByWo[r.work_order_id] = siteName
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
      let lastSeen: { placeName: string | null; at: string; lat: number | null; lng: number | null } | null = null
      if (checkin && pingAt) {
        lastSeen = new Date(pingAt) > new Date(checkin.checkedInAt)
          ? { placeName: p.last_seen_place_label, at: pingAt, lat: p.last_seen_lat, lng: p.last_seen_lng }
          : { placeName: checkin.placeName, at: checkin.checkedInAt, lat: checkin.lat, lng: checkin.lng }
      } else if (checkin) {
        lastSeen = { placeName: checkin.placeName, at: checkin.checkedInAt, lat: checkin.lat, lng: checkin.lng }
      } else if (pingAt) {
        lastSeen = { placeName: p.last_seen_place_label, at: pingAt, lat: p.last_seen_lat, lng: p.last_seen_lng }
      } else if (p.last_active_at) {
        // No check-in and no GPS-tagged ping (e.g. location permission was denied),
        // but the app-usage heartbeat still shows they were recently active — surface
        // that rather than showing "No location yet" for someone who clearly opened
        // the app today (this is the same last_active_at the Users page's Last Login
        // column falls back to, so the two should never visibly contradict each other).
        lastSeen = { placeName: null, at: p.last_active_at, lat: null, lng: null }
      }

      // First earlier check-in (after the latest one already used above) that has
      // real coordinates — skips over any older rows with missing lat/lng rather
      // than giving up entirely on "previous location" for that engineer.
      const earlierCheckin = (checkinsByEng[p.id] || []).slice(1).find(c => c.lat != null && c.lng != null)
      const previousSeen = earlierCheckin
        ? { placeName: earlierCheckin.placeName, at: earlierCheckin.checkedInAt, lat: earlierCheckin.lat!, lng: earlierCheckin.lng! }
        : null

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_id: p.employee_id,
        phone: p.phone,
        status: resolveDisplayStatus(p.engineer_status, p.engineer_status_updated_at, presentTodayIds.has(p.id), istTodayStr),
        statusSiteName,
        statusStartBy: p.engineer_status_start_by,
        statusUpdatedAt: p.engineer_status_updated_at,
        lastActiveAt: p.last_active_at,
        lastSeen,
        previousSeen,
        nextAssigned: upcoming ? { customerName: custMap[upcoming.customer_id] || '', scheduledDate: upcoming.scheduled_date, woNumber: upcoming.wo_number } : null,
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
    const { data: presentRow } = await admin.from('attendance')
      .select('engineer_id')
      .eq('engineer_id', id)
      .eq('attendance_date', istTodayStr)
      .eq('status', 'present')
      .maybeSingle()
    const presentToday = !!presentRow
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
        status: resolveDisplayStatus(p.engineer_status, p.engineer_status_updated_at, presentToday, istTodayStr),
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
