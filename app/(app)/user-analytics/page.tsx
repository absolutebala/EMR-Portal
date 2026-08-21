import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { getMyPermissions } from '@/app/actions/roles-actions'
import { getUserAnalyticsOverview } from '@/app/actions/user-analytics'
import UserAnalyticsPageClient from './UserAnalyticsPageClient'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function UserAnalyticsPage() {
  const user = await getAuthedUser()
  const month = currentMonth()

  const [{ data: profile }, { permissions, role }, { rows, error }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getMyPermissions(),
    getUserAnalyticsOverview(month),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'
  const hasPerms = Object.keys(permissions).length > 0
  const canView = userRole === 'Super Admin' || userRole === 'Head of Service' || (hasPerms && permissions['User Analytics — View'] === true)

  return (
    <UserAnalyticsPageClient
      canView={canView}
      initialMonth={month}
      initialRows={canView ? rows : []}
      initialError={canView ? error : null}
      userName={userName}
      userRole={userRole}
    />
  )
}
