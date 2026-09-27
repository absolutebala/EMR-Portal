'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

// Delete a notification (work order). Allowed for Super Admin / Head of Service, or any
// role whose 'Notifications — Delete' permission is on (matching the UI gate). All of a
// work order's child rows — check-ins, closures, form submissions, product requests,
// expenses, engineer assignments, visits — are ON DELETE CASCADE, and
// profiles.engineer_status_work_order_id is ON DELETE SET NULL, so a single delete
// cleans everything up.
export async function deleteWorkOrder(workOrderId: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated.' }

  const sb = adminClient()
  const { data: actor } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = actor?.role || ''
  let allowed = role === 'Super Admin' || role === 'Head of Service'
  if (!allowed) {
    const { data: roleRow } = await sb.from('roles').select('permissions').eq('name', role).maybeSingle()
    const perms = (roleRow?.permissions as Record<string, boolean> | null) || {}
    allowed = perms['Notifications — Delete'] === true
  }
  if (!allowed) return { error: 'You do not have permission to delete notifications.' }

  // notifications.entity_id / activity_log.entity_id reference a work order by a loose
  // uuid with no FK (the column is shared across entity types), so they aren't cascaded
  // on delete — clear them here so no dead references linger on the dashboard's recent
  // activity or off-site-status feeds after the notification is gone. activity_log stores
  // the work-order id under both 'work_order' and 'off_site_status_update' entity types.
  await sb.from('notifications').delete().eq('entity_type', 'work_order').eq('entity_id', workOrderId)
  await sb.from('activity_log').delete().in('entity_type', ['work_order', 'off_site_status_update']).eq('entity_id', workOrderId)

  const { error } = await sb.from('work_orders').delete().eq('id', workOrderId)
  if (error) return { error: error.message }
  return { error: null }
}
