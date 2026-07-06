'use server'

import { createClient } from '@supabase/supabase-js'

export async function resendInvite(email: string): Promise<{ error: string | null; inviteLink?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (error) return { error: error.message }

  return { error: null, inviteLink: data.properties?.action_link }
}
