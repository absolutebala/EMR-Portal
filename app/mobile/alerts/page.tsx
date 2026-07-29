export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyNotifications } from '@/app/actions/notifications'
import AlertsListClient from './AlertsListClient'

export default async function MobileAlertsPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(sb, user.id)

  const { notifications, error } = await getMyNotifications(50)

  return <AlertsListClient notifications={notifications} error={error} />
}
