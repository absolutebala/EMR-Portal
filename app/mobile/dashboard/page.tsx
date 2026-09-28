export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMobileDashboardData, getOverdueFollowUps } from '@/app/actions/mobile-actions'
import { getMyNotifications } from '@/app/actions/notifications'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const [{ stats, recentJobs, engineer, attendanceStatus, pendingProducts, updatePrompt, streak, error }, { followUps }, { unreadCount }] = await Promise.all([
    getMobileDashboardData(),
    getOverdueFollowUps(),
    getMyNotifications(1),
  ])

  return (
    <MobileDashboardClient
      stats={stats}
      recentJobs={recentJobs}
      engineer={engineer}
      attendanceStatus={attendanceStatus}
      error={error}
      overdueFollowUps={followUps}
      unreadAlerts={unreadCount}
      pendingProducts={pendingProducts}
      updatePrompt={updatePrompt}
      streak={streak}
    />
  )
}
