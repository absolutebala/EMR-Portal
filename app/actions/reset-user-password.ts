'use server'

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export async function resetUserPassword(email: string): Promise<{ error: string | null; resetLink?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Issue a fresh activation token so the reset link is reusable
  // until the user actually sets their password (which clears the token)
  const token = randomUUID()
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ activation_token: token })
    .eq('email', email)

  if (updateError) return { error: updateError.message }

  return { error: null, resetLink: `${siteUrl}/activate?token=${token}` }
}
