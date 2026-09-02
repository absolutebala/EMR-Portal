import { getAuthedUser } from '@/lib/cognito/server'
import { getFieldEngineersOverview } from '@/app/actions/get-engineers'
import { getMyPermissions } from '@/app/actions/roles-actions'
import EngineersPageClient from './EngineersPageClient'
import { adminClient } from '@/lib/db/admin-client'
import type { Profile } from '@/lib/types'

export default async function EngineersPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { engineers }, { permissions }, { data: fieldProfiles }, { data: managerProfiles }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getFieldEngineersOverview(),
    getMyPermissions(),
    // Full profiles for the field engineers so the reused Add/Edit User modal has the
    // complete record to edit, and the managers list for its "reports to" dropdown.
    adminClient().from('profiles').select('*').eq('role', 'Field Engineer'),
    adminClient().from('profiles').select('*').in('role', ['Service Manager', 'Head of Service', 'Super Admin']),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <EngineersPageClient
      engineers={engineers}
      userName={userName}
      userRole={userRole}
      permissions={permissions}
      editableProfiles={(fieldProfiles as unknown as Profile[]) || []}
      managers={(managerProfiles as unknown as Profile[]) || []}
    />
  )
}
