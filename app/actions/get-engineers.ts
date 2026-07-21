'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type EngineerStatus = 'on_site' | 'work_in_progress' | 'available' | 'off_duty'

export interface FieldEngineerOverview {
  id: string
  name: string
  employee_id: string
  phone: string | null
  status: EngineerStatus
  activeCustomerName: string | null
  lastActiveAt: string | null
  lastCheckin: { placeName: string | null; checkedInAt: string } | null
  nextAssigned: { customerName: string; scheduledDate: string | null; woNumber: string } | null
  openWorkOrders: number
  completedToday: number
}

const AVAILABLE_WINDOW_MS = 2 * 60 * 60 * 1000 // "recently active" = within the last 2 hours

export async function getFieldEngineersOverview(): Promise<{ engineers: FieldEngineerOverview[]; error: string | null }> {
  try {
    const admin = adminClient()

    // Build the roster from real activity (assigned work orders, site check-ins) rather
    // than filtering profiles by an exact role name — a role string that doesn't match
    // literally ("Field Engineer") would otherwise make real engineers vanish entirely.
    const [{ data: roleProfiles, error: profErr }, { data: assignedRows }, { data: checkinRows }] = await Promise.all([
      admin.from('profiles').select('id, first_name, last_name, employee_id, phone, last_active_at').eq('role', 'Field Engineer'),
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
      ? await admin.from('profiles').select('id, first_name, last_name, employee_id, phone, last_active_at').in('id', missingIds)
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

    const activeWoIds = (wos || []).filter(w => w.status === 'in_progress').map(w => w.id)
    const { data: submissions } = activeWoIds.length
      ? await admin.from('form_submissions').select('work_order_id').in('work_order_id', activeWoIds)
      : { data: [] as { work_order_id: string }[] }
    const submittedWoIds = new Set((submissions || []).map(s => s.work_order_id))

    // Latest check-in per engineer (checkins already ordered desc, so first match wins)
    const latestCheckinByEng: Record<string, { placeName: string | null; checkedInAt: string }> = {}
    for (const c of checkins || []) {
      if (!latestCheckinByEng[c.engineer_id]) {
        latestCheckinByEng[c.engineer_id] = { placeName: c.place_name, checkedInAt: c.checked_in_at }
      }
    }

    const todayStr = new Date().toLocaleDateString('en-CA')
    const now = Date.now()

    const engineers: FieldEngineerOverview[] = profiles.map(p => {
      const theirWOs = (wos || []).filter(w => w.engineer_id === p.id)
      const activeWO = theirWOs.find(w => w.status === 'in_progress')

      let status: EngineerStatus
      if (activeWO) {
        status = submittedWoIds.has(activeWO.id) ? 'work_in_progress' : 'on_site'
      } else if (p.last_active_at && now - new Date(p.last_active_at).getTime() < AVAILABLE_WINDOW_MS) {
        status = 'available'
      } else {
        status = 'off_duty'
      }

      const upcoming = theirWOs
        .filter(w => (w.status === 'assigned' || w.status === 'unassigned') && w.scheduled_date)
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))[0]

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        employee_id: p.employee_id,
        phone: p.phone,
        status,
        activeCustomerName: activeWO ? (custMap[activeWO.customer_id] || null) : null,
        lastActiveAt: p.last_active_at,
        lastCheckin: latestCheckinByEng[p.id] || null,
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
