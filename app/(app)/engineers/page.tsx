import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getFieldEngineersOverview } from '@/app/actions/get-engineers'
import EngineersPageClient from './EngineersPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function EngineersPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { engineers }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getFieldEngineersOverview(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return <EngineersPageClient engineers={engineers} userName={userName} userRole={userRole} />
}
