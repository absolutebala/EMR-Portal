import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getActivities, getActivityActors } from '@/app/actions/get-activities'
import ActivitiesPageClient from './ActivitiesPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function ActivitiesPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { activities, total, error }, { actors }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getActivities({ page: 1 }),
    getActivityActors(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <ActivitiesPageClient
      initialActivities={activities}
      initialTotal={total}
      initialError={error}
      actors={actors}
      userName={userName}
      userRole={userRole}
    />
  )
}
