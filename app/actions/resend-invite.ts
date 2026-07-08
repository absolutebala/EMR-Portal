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

  const redirectTo = `${siteUrl}/set-password`

  // Try invite type first (works for unconfirmed users)
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (!inviteError && inviteData?.properties?.action_link) {
    return { error: null, inviteLink: inviteData.properties.action_link }
  }

  // Fall back to recovery link (works for confirmed users who haven't set a password yet)
  const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (recoveryError) return { error: recoveryError.message }
  return { error: null, inviteLink: recoveryData?.properties?.action_link }
}
