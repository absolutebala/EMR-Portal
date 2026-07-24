export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyExpenseLogs } from '@/app/actions/expenses'
import ExpenseProjectDetailClient from './ExpenseProjectDetailClient'

interface Props {
  params: Promise<{ workOrderId: string }>
}

export default async function MobileExpenseProjectPage({ params }: Props) {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(sb, user.id)

  const { workOrderId } = await params
  const { logs, error } = await getMyExpenseLogs()
  const projectLogs = logs.filter(l => l.workOrderId === workOrderId)

  return <ExpenseProjectDetailClient workOrderId={workOrderId} logs={projectLogs} error={error} />
}
