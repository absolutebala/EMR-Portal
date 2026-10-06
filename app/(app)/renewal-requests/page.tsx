import { getAuthedUser } from '@/lib/cognito/server'
import { getRenewalRequests } from '@/app/actions/renewal-requests'
import { getMyPermissions } from '@/app/actions/roles-actions'
import RenewalRequestsPageClient from './RenewalRequestsPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function RenewalRequestsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { items }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getRenewalRequests(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const isAdmin = userRole === 'Super Admin' || userRole === 'Head of Service'
  const canApproveAsManager = isAdmin || !hasPerms || permissions['Renewal Requests — Approve'] === true
  const canApproveAsHead = isAdmin || !hasPerms || permissions['Renewal Requests — Final Approve'] === true

  return (
    <RenewalRequestsPageClient
      items={items}
      userName={userName}
      userRole={userRole}
      canApproveAsManager={canApproveAsManager}
      canApproveAsHead={canApproveAsHead}
    />
  )
}
