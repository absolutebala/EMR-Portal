import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getUsers } from '@/app/actions/get-users'
import { getMyPermissions } from '@/app/actions/roles-actions'
import UsersPageClient from './UsersPageClient'
import type { Profile } from '@/lib/types'
import { adminClient } from '@/lib/db/admin-client'

export default async function UsersPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { users }, { permissions, role }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getUsers(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || role || 'User'

  return (
    <UsersPageClient
      users={users as unknown as Profile[]}
      userName={userName}
      userRole={userRole}
      permissions={permissions}
    />
  )
}
