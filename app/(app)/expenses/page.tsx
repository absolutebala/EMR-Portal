import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getAllExpenseLogs } from '@/app/actions/expenses'
import { getMyPermissions } from '@/app/actions/roles-actions'
import ExpensesPageClient from './ExpensesPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function ExpensesPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { logs }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAllExpenseLogs(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const isAdmin = userRole === 'Super Admin' || userRole === 'Head of Service'
  const canApproveAsManager = isAdmin || !hasPerms || permissions['Expenses — Approve'] === true
  const canApproveAsHead = isAdmin || !hasPerms || permissions['Expenses — Final Approve'] === true

  return <ExpensesPageClient logs={logs} userName={userName} userRole={userRole} canApproveAsManager={canApproveAsManager} canApproveAsHead={canApproveAsHead} />
}
