export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileJobsList } from '@/app/actions/mobile-actions'
import JobsListClient from './JobsListClient'

export default async function MobileJobsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { workOrders, error } = await getMobileJobsList()

  return <JobsListClient workOrders={workOrders} error={error} />
}
