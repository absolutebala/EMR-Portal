'use server'

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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

  // Fetch or create the stable activation token for this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('activation_token')
    .eq('email', email)
    .maybeSingle()

  let token = profile?.activation_token as string | null

  if (!token) {
    // Back-fill: user was created before this feature; assign them a token now
    token = randomUUID()
    await supabase.from('profiles').update({ activation_token: token }).eq('email', email)
  }

  return { error: null, inviteLink: `${siteUrl}/auth/activate?token=${token}` }
}
