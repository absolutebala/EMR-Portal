export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getMyProductRequests } from '@/app/actions/products'
import RequestsListClient from './RequestsListClient'

export default async function MobileRequestsPage() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')

  const { requests, error } = await getMyProductRequests()

  return <RequestsListClient requests={requests} error={error} />
}
