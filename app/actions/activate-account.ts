'use server'

import { createClient } from '@supabase/supabase-js'

export async function activateAccount(
  token: string,
  password: string
): Promise<{ email?: string; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { error: 'config' }

  const adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('activation_token', token)
    .maybeSingle()

  if (!profile) return { error: 'already-active' }

  const { error: pwError } = await adminClient.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true,
  })

  if (pwError) return { error: pwError.message }

  await adminClient
    .from('profiles')
    .update({ activation_token: null, invite_pending: false })
    .eq('id', profile.id)

  return { email: profile.email }
}
