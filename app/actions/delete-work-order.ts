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

  const { error } = await sb.from('work_orders').delete().eq('id', workOrderId)
  if (error) return { error: error.message }
  return { error: null }
}
