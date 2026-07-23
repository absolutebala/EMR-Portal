export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileDashboardData, getOverdueFollowUps, getEngineerStatusPrompt } from '@/app/actions/mobile-actions'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const [{ stats, recentJobs, engineer, error }, { followUps }, { prompt }] = await Promise.all([
    getMobileDashboardData(),
    getOverdueFollowUps(),
    getEngineerStatusPrompt(),
  ])

  return (
    <MobileDashboardClient
      stats={stats}
      recentJobs={recentJobs}
      engineer={engineer}
      error={error}
      overdueFollowUps={followUps}
      statusPrompt={prompt}
    />
  )
}
