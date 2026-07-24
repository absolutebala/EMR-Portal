'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Explicit, engineer-set status (mobile app) — replaces the old heuristic derived
// from last_active_at + checkin/form-submission presence, which could only ever
// guess "on site" vs "off duty" and couldn't represent leave or travel at all.
export type EngineerStatus = 'available' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed'

export interface FieldEngineerOverview {
  id: string
  name: string
  employee_id: string
  phone: string | null
  status: EngineerStatus
  // Site name the status refers to, for on_the_way / travelling / reached / completed.
  statusSiteName: string | null
  statusUpdatedAt: string | null
  lastActiveAt: string | null
  // Whichever is more recent: the passive app-open location ping, or the last job
  // check-in — both are just "where was this engineer last known to be".
  lastSeen: { placeName: string | null; at: string } | null
  nextAssigned: { customerName: string; scheduledDate: string | null; woNumber: string } | null
  openWorkOrders: number
  completedToday: number
}

export async function getFieldEngineersOverview(): Promise<{ engineers: FieldEngineerOverview[]; error: string | null }> {
  try {
    const admin = adminClient()

    const PROFILE_COLS = 'id, first_name, last_name, employee_id, phone, last_active_at, engineer_status, engineer_status_work_order_id, engineer_status_updated_at, last_seen_lat, last_seen_lng, last_seen_place_label, last_seen_at'

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

    const [{ data: wos }, { data: checkins }] = await Promise.all([
      admin.from('work_orders')
        .select('id, wo_number, job_type, status, scheduled_date, customer_id, engineer_id, updated_at')
        .in('engineer_id', engineerIds),
      admin.from('work_order_checkins')
        .select('engineer_id, place_name, checked_in_at')
        .in('engineer_id', engineerIds)
        .order('checked_in_at', { ascending: false }),
    ])

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

    // Latest check-in per engineer (checkins already ordered desc, so first match wins)
    const latestCheckinByEng: Record<string, { placeName: string | null; checkedInAt: string }> = {}
    for (const c of checkins || []) {
      if (!latestCheckinByEng[c.engineer_id]) {
        latestCheckinByEng[c.engineer_id] = { placeName: c.place_name, checkedInAt: c.checked_in_at }
      }
    }

    const todayStr = new Date().toLocaleDateString('en-CA')

    const engineers: FieldEngineerOverview[] = profiles.map(p => {
      const theirWOs = (wos || []).filter(w => w.engineer_id === p.id)

      // Nearest scheduled_date among anything still open — not restricted to
      // assigned/unassigned — so this reflects what the engineer is actually busy
      // with next (including a job already in progress), not just untouched jobs.
      const upcoming = theirWOs
        .filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment' && w.scheduled_date)
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))[0]

      const statusWo = p.engineer_status_work_order_id ? theirWOs.find(w => w.id === p.engineer_status_work_order_id) : null
      const statusSiteName = p.engineer_status_work_order_id
        ? (siteNameByWo[p.engineer_status_work_order_id] || (statusWo ? custMap[statusWo.customer_id] : null) || null)
        : null

      const checkin = latestCheckinByEng[p.id]
      const pingAt = p.last_seen_at
      let lastSeen: { placeName: string | null; at: string } | null = null
      if (checkin && pingAt) {
        lastSeen = new Date(pingAt) > new Date(checkin.checkedInAt)
          ? { placeName: p.last_seen_place_label, at: pingAt }
          : { placeName: checkin.placeName, at: checkin.checkedInAt }
      } else if (checkin) {
        lastSeen = { placeName: checkin.placeName, at: checkin.checkedInAt }
      } else if (pingAt) {
        lastSeen = { placeName: p.last_seen_place_label, at: pingAt }
      }

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_id: p.employee_id,
        phone: p.phone,
        status: (p.engineer_status as EngineerStatus) || 'available',
        statusSiteName,
        statusUpdatedAt: p.engineer_status_updated_at,
        lastActiveAt: p.last_active_at,
        lastSeen,
        nextAssigned: upcoming ? { customerName: custMap[upcoming.customer_id] || '', scheduledDate: upcoming.scheduled_date, woNumber: upcoming.wo_number } : null,
        openWorkOrders: theirWOs.filter(w => w.status !== 'completed').length,
        completedToday: theirWOs.filter(w => w.status === 'completed' && w.updated_at && new Date(w.updated_at).toLocaleDateString('en-CA') === todayStr).length,
      }
    })

    return { engineers, error: null }
  } catch (e: unknown) {
    return { engineers: [], error: e instanceof Error ? e.message : String(e) }
  }
}
