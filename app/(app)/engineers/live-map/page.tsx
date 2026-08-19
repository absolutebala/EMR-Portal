export const dynamic = 'force-dynamic'

import { getAuthedUser } from '@/lib/cognito/server'
import { getFieldEngineersOverview } from '@/app/actions/get-engineers'
import LiveMapClient from './LiveMapClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function LiveMapPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { engineers, error }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getFieldEngineersOverview(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return <LiveMapClient engineers={engineers} error={error} userName={userName} userRole={userRole} />
}
