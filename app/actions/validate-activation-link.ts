'use server'

import { createClient } from '@supabase/supabase-js'

export async function validateActivationLink(
  token: string
): Promise<{ hashed_token?: string; email?: string; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { error: 'config' }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('activation_token', token)
    .maybeSingle()

  if (!profile) return { error: 'already-active' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (error || !data?.properties?.hashed_token) return { error: 'link-error' }

  return { hashed_token: data.properties.hashed_token, email: profile.email }
}
