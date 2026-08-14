export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyNotifications } from '@/app/actions/notifications'
import AlertsListClient from './AlertsListClient'

export default async function MobileAlertsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { notifications, error } = await getMyNotifications(50)

  return <AlertsListClient notifications={notifications} error={error} />
}
