export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMobileWorkOrders } from '@/app/actions/mobile-actions'
import NewRequestClient from './NewRequestClient'

export default async function NewProductRequestPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const { workOrders, error } = await getMobileWorkOrders()

  return <NewRequestClient workOrders={workOrders} error={error} />
}
