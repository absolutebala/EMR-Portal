export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMobileDashboardData } from '@/app/actions/mobile-actions'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/mobile/login')

  const { stats, recentJobs, engineer, error } = await getMobileDashboardData()

  return <MobileDashboardClient stats={stats} recentJobs={recentJobs} engineer={engineer} error={error} />
}
