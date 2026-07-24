export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyExpenseLogs } from '@/app/actions/expenses'
import ExpensesListClient from './ExpensesListClient'

export default async function MobileExpensesPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(sb, user.id)

  const { logs, error } = await getMyExpenseLogs()

  return <ExpensesListClient logs={logs} error={error} />
}
