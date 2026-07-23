'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface AlertNotification {
  id: string
  woNumber: string
  customerName: string
  engineerName: string
  scheduledDate: string | null
}

export interface WorkOrderAlerts {
  overdue: AlertNotification[]
  needsReassignment: AlertNotification[]
  engineerOnLeave: AlertNotification[]
}

type WoRow = { id: string; wo_number: string; scheduled_date: string | null; engineer_id: string | null; customers: { name: string } | null }

// Uses the admin (service-role) client — profiles is RLS-locked to "view your own
// row" for most roles, and this needs to read every relevant engineer's name/status
// regardless of who's viewing the Notifications page.
export async function getWorkOrderAlerts(): Promise<{ alerts: WorkOrderAlerts; error: string | null }> {
  try {
    const admin = adminClient()
    const todayStr = new Date().toLocaleDateString('en-CA')

    const [{ data: overdueRows }, { data: reassignRows }, { data: todayRows }] = await Promise.all([
      admin.from('work_orders').select('id, wo_number, scheduled_date, engineer_id, customers(name)').eq('status', 'in_progress').lt('scheduled_date', todayStr).order('scheduled_date', { ascending: true }).limit(8),
      admin.from('work_orders').select('id, wo_number, scheduled_date, engineer_id, customers(name)').eq('status', 'needs_reassignment').order('updated_at', { ascending: false }).limit(8),
      admin.from('work_orders').select('id, wo_number, scheduled_date, engineer_id, customers(name)').eq('scheduled_date', todayStr).neq('status', 'completed').not('engineer_id', 'is', null),
    ])

    const overdue = (overdueRows as unknown as WoRow[]) || []
    const reassign = (reassignRows as unknown as WoRow[]) || []
    const today = (todayRows as unknown as WoRow[]) || []

    // "Engineer on leave" can only be checked against their status *right now* —
    // there's no leave calendar, just a live status, so this is only meaningful for
    // notifications scheduled today (comparing today's schedule to today's status).
    const todayEngineerIds = [...new Set(today.map(w => w.engineer_id).filter(Boolean))] as string[]
    const { data: onLeaveProfiles } = todayEngineerIds.length
      ? await admin.from('profiles').select('id').in('id', todayEngineerIds).eq('engineer_status', 'on_leave')
      : { data: [] as { id: string }[] }
    const onLeaveIds = new Set((onLeaveProfiles || []).map(p => p.id))
    const engineerOnLeaveRows = today.filter(w => w.engineer_id && onLeaveIds.has(w.engineer_id))

    const allEngineerIds = [...new Set([...overdue, ...reassign, ...engineerOnLeaveRows].map(w => w.engineer_id).filter(Boolean))] as string[]
    const { data: engineerRows } = allEngineerIds.length
      ? await admin.from('profiles').select('id, first_name, last_name').in('id', allEngineerIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] }
    const engineerNameById: Record<string, string> = {}
    ;(engineerRows || []).forEach(p => { engineerNameById[p.id] = `${p.first_name} ${p.last_name}` })

    const toAlert = (w: WoRow): AlertNotification => ({
      id: w.id,
      woNumber: w.wo_number,
      customerName: w.customers?.name || 'Unknown customer',
      engineerName: w.engineer_id ? (engineerNameById[w.engineer_id] || 'Engineer') : 'Unassigned',
      scheduledDate: w.scheduled_date,
    })

    return {
      alerts: {
        overdue: overdue.map(toAlert),
        needsReassignment: reassign.map(toAlert),
        engineerOnLeave: engineerOnLeaveRows.map(toAlert),
      },
      error: null,
    }
  } catch (e: unknown) {
    return { alerts: { overdue: [], needsReassignment: [], engineerOnLeave: [] }, error: e instanceof Error ? e.message : String(e) }
  }
}
