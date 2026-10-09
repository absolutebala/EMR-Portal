import { getAuthedUser } from '@/lib/cognito/server'
import { getActivities, getActivityActors, getActivityRoles } from '@/app/actions/get-activities'
import ActivitiesPageClient from './ActivitiesPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function ActivitiesPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { activities, total, error }, { actors }, { roles }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getActivities({ page: 1 }),
    getActivityActors(),
    getActivityRoles(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <ActivitiesPageClient
      initialActivities={activities}
      initialTotal={total}
      initialError={error}
      actors={actors}
      roles={roles}
      userName={userName}
      userRole={userRole}
    />
  )
}
