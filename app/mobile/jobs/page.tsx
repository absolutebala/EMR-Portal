export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMobileJobsList } from '@/app/actions/mobile-actions'
import JobsListClient from './JobsListClient'

export default async function MobileJobsPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/mobile/login')

  const { workOrders, error } = await getMobileJobsList()

  return <JobsListClient workOrders={workOrders} error={error} />
}
