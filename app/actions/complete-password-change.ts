'use server'

import { createClient as serverClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function completePasswordChange(): Promise<{ error: string | null }> {
  const sb = await serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminClient()
  const [{ error: profileError }, { error: metaError }] = await Promise.all([
    admin.from('profiles').update({ must_change_password: false, invite_pending: false }).eq('id', user.id),
    admin.auth.admin.updateUserById(user.id, { user_metadata: { must_change_password: false } }),
  ])

  if (profileError) return { error: profileError.message }
  if (metaError) return { error: metaError.message }
  return { error: null }
}
