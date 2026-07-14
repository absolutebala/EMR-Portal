export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMobileWorkOrders } from '@/app/actions/mobile-actions'
import MobileDashboardClient from './MobileDashboardClient'

export default async function MobileDashboardPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/mobile/login')

  const { workOrders, engineer, error } = await getMobileWorkOrders()

  return <MobileDashboardClient workOrders={workOrders} engineer={engineer} error={error} />
}
