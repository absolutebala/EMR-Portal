export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileJobsList } from '@/app/actions/mobile-actions'
import NewExpenseClient from './NewExpenseClient'

export default async function NewExpensePage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { workOrders, error } = await getMobileJobsList()

  return <NewExpenseClient workOrders={workOrders} error={error} />
}
