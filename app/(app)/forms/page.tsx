import { getAuthedUser } from '@/lib/cognito/server'
import { getForms } from '@/app/actions/get-forms'
import { getMyPermissions } from '@/app/actions/roles-actions'
import FormsPageClient from './FormsPageClient'
import type { Form } from '@/lib/types'
import { adminClient } from '@/lib/db/admin-client'

export default async function FormsPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { data: forms }, { permissions }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getForms(),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return <FormsPageClient forms={(forms as Form[]) || []} userName={userName} userRole={userRole} permissions={permissions} />
}
