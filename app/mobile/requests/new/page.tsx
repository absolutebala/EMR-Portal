export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileWorkOrders } from '@/app/actions/mobile-actions'
import NewRequestClient from './NewRequestClient'

export default async function NewProductRequestPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { workOrders, error } = await getMobileWorkOrders()

  return <NewRequestClient workOrders={workOrders} error={error} />
}
