export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyAnalyticsSummary } from '@/app/actions/my-analytics'
import MyAnalyticsClient from './MyAnalyticsClient'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function MyAnalyticsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const month = currentMonth()
  const { summary, error } = await getMyAnalyticsSummary(month)

  return <MyAnalyticsClient initialMonth={month} initialSummary={summary} initialError={error} />
}
