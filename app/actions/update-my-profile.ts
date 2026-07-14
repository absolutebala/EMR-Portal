'use server'

import { createClient as createServerClient, getAuthedUser } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function updateMyProfile(updates: {
  first_name: string
  last_name: string
  phone: string | null
}): Promise<{ error: string | null }> {
  try {
    const sb = await createServerClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }
    const { error } = await adminClient().from('profiles').update(updates).eq('id', user.id)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  try {
    const sb = await createServerClient()
    const user = await getAuthedUser(sb)
    if (!user?.email) return { error: 'Not authenticated' }

    // Verify current password using a fresh anon client (doesn't affect the current session)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const anonSb = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: signInErr } = await anonSb.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (signInErr) return { error: 'Current password is incorrect.' }

    const { error } = await adminClient().auth.admin.updateUserById(user.id, { password: newPassword })
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
