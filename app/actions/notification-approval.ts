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

export type PendingExpenseApproval = {
  id: string
  woNumber: string
  engineerName: string
  customerName: string
  createdAt: string | null
  status: 'pending' | 'rejected'
}

// Field-Engineer-created notifications whose expenses still need an approve/reject
// decision — surfaced on the Expenses page so approvers act on them in context.
// Returns [] for non-approvers.
export async function getNotificationsPendingExpenseApproval(): Promise<{ items: PendingExpenseApproval[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { items: [], error: 'Not authenticated' }
  const admin = adminClient()
  const { data: actor } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!actor || !APPROVER_ROLES.includes(actor.role as string)) return { items: [], error: null }

  const { data: wos } = await admin.from('work_orders')
    .select('id, wo_number, ticket_number, created_at, created_by, customer_id, direct_customer_name, expense_approval')
    .in('expense_approval', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
  if (!wos?.length) return { items: [], error: null }

  const creatorIds = [...new Set(wos.map(w => w.created_by).filter(Boolean))] as string[]
  const custIds = [...new Set(wos.map(w => w.customer_id).filter(Boolean))] as string[]
  const [{ data: people }, { data: customers }] = await Promise.all([
    creatorIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', creatorIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    custIds.length ? admin.from('customers').select('id, name').in('id', custIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const nameById = Object.fromEntries((people || []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
  const custById = Object.fromEntries((customers || []).map(c => [c.id, c.name]))

  return {
    items: wos.map(w => ({
      id: w.id,
      woNumber: w.wo_number || w.ticket_number || '',
      engineerName: w.created_by ? (nameById[w.created_by as string] || 'Field Engineer') : 'Field Engineer',
      customerName: w.customer_id ? (custById[w.customer_id as string] || '') : (w.direct_customer_name || ''),
      createdAt: w.created_at as string | null,
      status: w.expense_approval as 'pending' | 'rejected',
    })),
    error: null,
  }
}

export async function approveNotificationExpenses(workOrderId: string): Promise<{ error: string | null }> {
  return applyDecision(workOrderId, 'approved')
}

export async function rejectNotificationExpenses(workOrderId: string): Promise<{ error: string | null }> {
  return applyDecision(workOrderId, 'rejected')
}
