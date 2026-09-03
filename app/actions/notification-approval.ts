'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'

// Only these roles can approve/reject a Field-Engineer-created notification's expenses.
const APPROVER_ROLES = ['Service Manager', 'Head of Service', 'Super Admin']

async function applyDecision(workOrderId: string, decision: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = adminClient()

  const { data: actor } = await admin.from('profiles').select('first_name, last_name, role').eq('id', user.id).maybeSingle()
  if (!actor || !APPROVER_ROLES.includes(actor.role as string)) {
    return { error: 'You are not allowed to approve or reject notifications.' }
  }
  const actorName = `${actor.first_name} ${actor.last_name}`

  const { data: wo } = await admin.from('work_orders').select('wo_number, created_by, expense_approval').eq('id', workOrderId).maybeSingle()
  if (!wo) return { error: 'Notification not found' }
  if (!wo.expense_approval) return { error: 'This notification does not need approval.' }

  const { error } = await admin.from('work_orders').update({
    expense_approval: decision,
    expense_approval_by: user.id,
    expense_approval_at: new Date().toISOString(),
  }).eq('id', workOrderId)
  if (error) return { error: error.message }

  const verb = decision === 'approved' ? 'Approved' : 'Rejected'
  await admin.from('work_order_activity').insert({ work_order_id: workOrderId, action: `${verb} expenses for this notification`, actor_name: actorName })
  logActivity(admin, { actorId: user.id, actorName, action: `${verb} expenses for notification ${wo.wo_number}`, entityType: 'work_order', entityId: workOrderId }).catch(() => {})

  // Let the field engineer who raised it know the outcome.
  if (wo.created_by) {
    notifyUsers(admin, [{ userId: wo.created_by as string }], {
      type: decision === 'approved' ? 'work_order_approved' : 'work_order_rejected',
      title: decision === 'approved' ? 'Notification approved' : 'Notification rejected',
      body: decision === 'approved'
        ? `${actorName} approved ${wo.wo_number}. You can now add expenses.`
        : `${actorName} rejected expenses for ${wo.wo_number}.`,
      entityType: 'work_order', entityId: workOrderId, linkPath: `/mobile/work-orders/${workOrderId}`,
    }).catch(() => {})
  }

  return { error: null }
}

export async function approveNotificationExpenses(workOrderId: string): Promise<{ error: string | null }> {
  return applyDecision(workOrderId, 'approved')
}

export async function rejectNotificationExpenses(workOrderId: string): Promise<{ error: string | null }> {
  return applyDecision(workOrderId, 'rejected')
}
