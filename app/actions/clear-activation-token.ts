'use server'

import { createClient } from '@supabase/supabase-js'

export async function clearActivationToken(userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  await supabase.from('profiles').update({ activation_token: null }).eq('id', userId)
}
