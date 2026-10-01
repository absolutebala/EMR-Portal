import { getAuthedUser } from '@/lib/cognito/server'
import { getAllExpenseLogs } from '@/app/actions/expenses'
import { getNotificationsPendingExpenseApproval } from '@/app/actions/notification-approval'
import { getMyPermissions } from '@/app/actions/roles-actions'
import ExpensesPageClient from './ExpensesPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function ExpensesPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { logs }, { items: pendingApprovals }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAllExpenseLogs(),
    getNotificationsPendingExpenseApproval(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const isAdmin = userRole === 'Super Admin' || userRole === 'Head of Service'
  const canApproveAsManager = isAdmin || !hasPerms || permissions['Expenses — Approve'] === true
  const canApproveAsHead = isAdmin || !hasPerms || permissions['Expenses — Final Approve'] === true
  // Edit / delete / export are correction & reporting tools — available to anyone who can
  // act on expenses (a manager or head approver, or a full-access admin).
  const canManage = isAdmin || canApproveAsManager || canApproveAsHead

  // Field-Engineer-created notifications wait here for an expense-unlock decision.
  const canApproveNotifications = userRole === 'Super Admin' || userRole === 'Head of Service' || userRole === 'Service Manager'

  return <ExpensesPageClient logs={logs} userName={userName} userRole={userRole} canApproveAsManager={canApproveAsManager} canApproveAsHead={canApproveAsHead} canManage={canManage} pendingApprovals={pendingApprovals} canApproveNotifications={canApproveNotifications} />
}
