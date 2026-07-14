import { redirect } from 'next/navigation'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function MobileRoot() {
  const sb = await createClient()
  const user = await getAuthedUser(sb)
  if (!user) redirect('/mobile/login')
  redirect('/mobile/dashboard')
}
