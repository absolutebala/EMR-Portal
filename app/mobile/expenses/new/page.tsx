export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileJobsList } from '@/app/actions/mobile-actions'
import NewExpenseClient from './NewExpenseClient'

export default async function NewExpensePage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(sb, user.id)

  const { workOrders, error } = await getMobileJobsList()

  return <NewExpenseClient workOrders={workOrders} error={error} />
}
