import { getAuthedUser } from '@/lib/cognito/server'
import { getAllProductRequests } from '@/app/actions/products'
import { getMyPermissions } from '@/app/actions/roles-actions'
import RequestsPageClient from './RequestsPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function RequestsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { requests }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getAllProductRequests(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const can = (key: string) => userRole === 'Super Admin' || userRole === 'Head of Service' || !hasPerms || permissions[key] === true

  return (
    <RequestsPageClient
      requests={requests}
      userName={userName}
      userRole={userRole}
      canApprove={can('Product Requests — Approve')}
      canDispatch={can('Product Requests — Dispatch')}
      canDeliver={can('Product Requests — Deliver')}
    />
  )
}
