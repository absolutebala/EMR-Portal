'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMyDepartmentScope } from './departments'
import {
  buildExpenseLogViews,
  getExpenseEligibilityCore, getExpenseTypesCore, getOrCreateExpenseTypeCore,
  submitExpenseLogCore, getMyExpenseLogsCore,
  type ExpenseType, type BLEligibility, type ExpenseLogView,
} from '@/lib/mobile/core/expenses'
// NOTE: ExpenseType, BLEligibility, ExpenseLogView now live in
// lib/mobile/core/expenses.ts — import them from there directly, not from this file
// (same 'use server' type re-export constraint as elsewhere in this codebase).

// ---------- Eligibility, expense types, submit + my logs (mobile) ----------
// These are now thin wrappers over lib/mobile/core/expenses.ts — business logic
// lives there, shared with the RN REST routes.

export async function getExpenseEligibility(workOrderId: string): Promise<{ eligibility: BLEligibility | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { eligibility: null, error: 'Not authenticated' }
  return getExpenseEligibilityCore(adminClient(), user.id, workOrderId)
}

export async function getExpenseTypes(): Promise<{ types: ExpenseType[]; error: string | null }> {
  return getExpenseTypesCore(adminClient())
}

export async function getOrCreateExpenseType(name: string): Promise<{ type: ExpenseType | null; error: string | null }> {
  return getOrCreateExpenseTypeCore(adminClient(), name)
}

export async function submitExpenseLog(params: {
  workOrderId: string
  expenseTypeId: string
  expenseDate: string
  amount: number
  claimType?: 'flat' | 'actual'
  photo?: { base64: string; mimeType: string; ext: string }
}): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return submitExpenseLogCore(adminClient(), user.id, params)
}

export async function getMyExpenseLogs(): Promise<{ logs: ExpenseLogView[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { logs: [], error: 'Not authenticated' }
  return getMyExpenseLogsCore(adminClient(), user.id)
}

// ---------- Desktop: per-engineer + admin review + two-stage approval ----------

export async function getExpenseLogsForEngineer(engineerId: string): Promise<{ logs: ExpenseLogView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: rows, error } = await admin.from('expense_logs').select('*').eq('engineer_id', engineerId).order('created_at', { ascending: false })
    if (error) return { logs: [], error: error.message }
    const logs = await buildExpenseLogViews(admin, rows || [])
    return { logs, error: null }
  } catch (e: unknown) {
    return { logs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAllExpenseLogs(): Promise<{ logs: ExpenseLogView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const departmentScope = await getMyDepartmentScope()
    const { data: rows, error } = await admin.from('expense_logs').select('*').order('created_at', { ascending: false })
    if (error) return { logs: [], error: error.message }
    // expense_logs has no department_id of its own — a Service Manager's scope is
    // resolved via each row's linked work order.
    let scopedRows = rows || []
    if (departmentScope && scopedRows.length) {
      const woIds = [...new Set(scopedRows.map(r => r.work_order_id))]
      const { data: wos } = await admin.from('work_orders').select('id, department_id').in('id', woIds)
      const scopedWoIds = new Set((wos || []).filter(w => departmentScope.includes(w.department_id || '')).map(w => w.id))
      scopedRows = scopedRows.filter(r => scopedWoIds.has(r.work_order_id))
    }
    const logs = await buildExpenseLogViews(admin, scopedRows)
    return { logs, error: null }
  } catch (e: unknown) {
    return { logs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

async function getActorName(admin: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
  return actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
}

// Stage 1: Service Manager (or anyone with "Expenses — Approve"). Approving moves
// the claim to 'manager_approved' — it does NOT finalize it, even for a Super Admin
// / Head of Service acting here; rejecting is final at either stage.
export async function submitManagerDecision(id: string, decision: 'approve' | 'reject'): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { data: current } = await admin.from('expense_logs').select('status').eq('id', id).maybeSingle()
    if (current?.status !== 'pending') return { error: 'This expense is no longer awaiting first-level approval.' }

    const actorName = await getActorName(admin, user.id)
    const now = new Date().toISOString()
    const patch = decision === 'approve'
      ? { status: 'manager_approved', manager_approved_by: user.id, manager_approved_at: now }
      : { status: 'rejected', reviewed_by: user.id, reviewed_at: now }

    const { data: updated, error } = await admin.from('expense_logs').update(patch).eq('id', id).select('engineer_id, work_order_id').maybeSingle()
    if (error) return { error: error.message }

    logActivity(admin, {
      actorId: user.id, actorName,
      action: decision === 'approve' ? 'Approved expense log (first level)' : 'Rejected expense log',
      entityType: 'expense_log', entityId: id,
    }).catch(() => {})

    if (decision === 'approve') {
      notifyUsers(admin, [{ role: 'Super Admin' }, { role: 'Head of Service' }], {
        type: 'expense_status',
        title: 'Expense awaiting your final approval',
        body: `${actorName} approved an expense at the first level — it now needs your final approval.`,
        entityType: 'expense_log', entityId: id,
        linkPath: '/expenses',
      }).catch(() => {})
    } else if (updated?.engineer_id) {
      notifyUsers(admin, [{ userId: updated.engineer_id }], {
        type: 'expense_status',
        title: 'Expense rejected',
        body: `${actorName} rejected your expense.`,
        entityType: 'expense_log', entityId: id,
        linkPath: updated.work_order_id ? `/mobile/work-orders/${updated.work_order_id}` : '/mobile/expenses',
      }).catch(() => {})
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Stage 2: Super Admin / Head of Service only, and only once a claim has already
// cleared stage 1 — this is the final decision either way.
export async function submitHeadDecision(id: string, decision: 'approve' | 'reject'): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { data: current } = await admin.from('expense_logs').select('status').eq('id', id).maybeSingle()
    if (current?.status !== 'manager_approved') return { error: 'This expense is not awaiting final approval.' }

    const actorName = await getActorName(admin, user.id)
    const status = decision === 'approve' ? 'approved' : 'rejected'

    const { data: updated, error } = await admin.from('expense_logs').update({
      status, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', id).select('engineer_id, work_order_id').maybeSingle()
    if (error) return { error: error.message }

    logActivity(admin, {
      actorId: user.id, actorName,
      action: `${decision === 'approve' ? 'Approved' : 'Rejected'} expense log (final)`,
      entityType: 'expense_log', entityId: id,
    }).catch(() => {})

    if (updated?.engineer_id) {
      notifyUsers(admin, [{ userId: updated.engineer_id }], {
        type: 'expense_status',
        title: `Expense ${status}`,
        body: `${actorName} ${status} your expense.`,
        entityType: 'expense_log', entityId: id,
        linkPath: updated.work_order_id ? `/mobile/work-orders/${updated.work_order_id}` : '/mobile/expenses',
      }).catch(() => {})
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
