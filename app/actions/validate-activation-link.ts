'use server'

import { createClient } from '@supabase/supabase-js'

export async function validateActivationLink(
  token: string
): Promise<{ access_token?: string; refresh_token?: string; email?: string; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !anonKey) return { error: 'config' }

  const adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('activation_token', token)
    .maybeSingle()

  if (!profile) return { error: 'already-active' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url
  const { data, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (linkError || !data?.properties?.hashed_token) return { error: 'link-error' }

  // Exchange the OTP server-side so the browser never needs PKCE state.
  // The anon client can call verifyOtp without any browser storage.
  const anonClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'recovery',
  })

  if (verifyError || !verifyData.session) return { error: 'otp-failed' }

  return {
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
    email: profile.email,
  }
}
