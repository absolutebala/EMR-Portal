import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { getMyPermissions } from '@/app/actions/roles-actions'
import { getComplaintReports } from '@/app/actions/get-reports'
import { adminClient } from '@/lib/db/admin-client'
import ReportsPageClient from './ReportsPageClient'

export default async function ReportsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { permissions, role }, { rows, error }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getMyPermissions(),
    getComplaintReports(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  // Gate direct URL access the same way the sidebar hides the item: Super Admin / Head of
  // Service always pass; everyone else needs the 'Reports — View' permission.
  const hasPerms = Object.keys(permissions).length > 0
  const canView = userRole === 'Super Admin' || userRole === 'Head of Service' || !hasPerms || permissions['Reports — View'] === true
  if (!canView) redirect('/dashboard')

  return (
    <ReportsPageClient
      initialRows={rows}
      initialError={error}
      userName={userName}
      userRole={userRole}
    />
  )
}
