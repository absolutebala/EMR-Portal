import { getAuthedUser } from '@/lib/cognito/server'
import { getWorkOrders, getAssignableEngineers } from '@/app/actions/get-work-orders'
import { getWorkOrderAlerts } from '@/app/actions/get-work-order-alerts'
import WorkOrdersPageClient from './WorkOrdersPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function WorkOrdersPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { workOrders }, { engineers }, { alerts }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getWorkOrders(),
    getAssignableEngineers(),
    getWorkOrderAlerts(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <WorkOrdersPageClient
      workOrders={workOrders}
      engineers={engineers}
      alerts={alerts}
      userName={userName}
      userRole={userRole}
    />
  )
}
