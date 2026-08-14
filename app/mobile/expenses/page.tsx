export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyExpenseLogs } from '@/app/actions/expenses'
import ExpensesListClient from './ExpensesListClient'

export default async function MobileExpensesPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { logs, error } = await getMyExpenseLogs()

  return <ExpensesListClient logs={logs} error={error} />
}
