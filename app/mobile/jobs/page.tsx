export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileJobsList } from '@/app/actions/mobile-actions'
import JobsListClient from './JobsListClient'

export default async function MobileJobsPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const { workOrders, error } = await getMobileJobsList()

  return <JobsListClient workOrders={workOrders} error={error} />
}
