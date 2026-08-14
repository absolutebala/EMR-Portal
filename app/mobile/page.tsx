import { redirect } from 'next/navigation'
import { getAuthedUser } from '@/lib/cognito/server'

export const dynamic = 'force-dynamic'

export default async function MobileRoot() {
  const user = await getAuthedUser()
  if (!user) redirect('/mobile/login')
  redirect('/mobile/dashboard')
}
