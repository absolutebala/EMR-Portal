export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileDashboardData } from '@/app/actions/mobile-actions'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const { stats, recentJobs, engineer, error } = await getMobileDashboardData()

  return <MobileDashboardClient stats={stats} recentJobs={recentJobs} engineer={engineer} error={error} />
}
