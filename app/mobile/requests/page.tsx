export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'
import { requireMobilePasswordChanged } from '@/lib/mobile/authGuard'
import { getMyProductRequests } from '@/app/actions/products'
import RequestsListClient from './RequestsListClient'

export default async function MobileRequestsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  await requireMobilePasswordChanged(user.id)

  const { requests, error } = await getMyProductRequests()

  return <RequestsListClient requests={requests} error={error} />
}
