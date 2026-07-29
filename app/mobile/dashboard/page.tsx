export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileDashboardData, getOverdueFollowUps, getEngineerStatusPrompt } from '@/app/actions/mobile-actions'
import { getMyNotifications } from '@/app/actions/notifications'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(sb, user.id)

  const [{ stats, recentJobs, engineer, error }, { followUps }, { prompt }, { unreadCount }] = await Promise.all([
    getMobileDashboardData(),
    getOverdueFollowUps(),
    getEngineerStatusPrompt(),
    getMyNotifications(1),
  ])

  return (
    <MobileDashboardClient
      stats={stats}
      recentJobs={recentJobs}
      engineer={engineer}
      error={error}
      overdueFollowUps={followUps}
      statusPrompt={prompt}
      unreadAlerts={unreadCount}
    />
  )
}
