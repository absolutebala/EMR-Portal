import { getAuthedUser } from '@/lib/cognito/server'
import { getWorkOrders, getAssignableEngineers } from '@/app/actions/get-work-orders'
import { getWorkOrderAlerts } from '@/app/actions/get-work-order-alerts'
import { getDepartments } from '@/app/actions/departments'
import { getMyPermissions } from '@/app/actions/roles-actions'
import WorkOrdersPageClient from './WorkOrdersPageClient'
import { adminClient } from '@/lib/db/admin-client'

export default async function WorkOrdersPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { workOrders }, { engineers }, { alerts }, { departments }, { permissions }, { data: serviceManagers }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getWorkOrders(),
    getAssignableEngineers(),
    getWorkOrderAlerts(),
    getDepartments(),
    getMyPermissions(),
    // Service Managers populate the "created by" filter on the Notifications list.
    adminClient().from('profiles').select('id,first_name,last_name').eq('role', 'Service Manager').order('first_name'),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  return (
    <WorkOrdersPageClient
      workOrders={workOrders}
      engineers={engineers}
      serviceManagers={serviceManagers ?? []}
      currentUserId={user!.id}
      alerts={alerts}
      userName={userName}
      userRole={userRole}
      departments={departments}
      permissions={permissions}
    />
  )
}
