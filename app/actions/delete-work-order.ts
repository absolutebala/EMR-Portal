'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

// Delete a notification (work order). Gated to Super Admin / Head of Service, mirroring
// the delete-customer rule. All of a work order's child rows — check-ins, closures,
// form submissions, product requests, expenses, engineer assignments, visits — are
// ON DELETE CASCADE, and profiles.engineer_status_work_order_id is ON DELETE SET NULL,
// so a single delete cleans everything up.
export async function deleteWorkOrder(workOrderId: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated.' }

  const sb = adminClient()
  const { data: actor } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (actor?.role !== 'Super Admin' && actor?.role !== 'Head of Service') {
    return { error: 'Only Super Admin or Head of Service can delete notifications.' }
  }

  const { error } = await sb.from('work_orders').delete().eq('id', workOrderId)
  if (error) return { error: error.message }
  return { error: null }
}
