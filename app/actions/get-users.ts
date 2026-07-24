'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function getUsers(): Promise<{ users: unknown[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const admin = adminClient()

    // Run auth check and admin list in parallel — they don't depend on each other
    const [user, { data: authData }] = await Promise.all([
      getAuthedUser(sb),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ])

    if (!user) return { users: [], error: 'Not authenticated.' }

    const signInMap: Record<string, string | null> = {}
    for (const au of authData?.users ?? []) {
      signInMap[au.id] = au.last_sign_in_at ?? null
    }

    // "Last login" shows whichever is more recent: an actual credential sign-in
    // (auth.users.last_sign_in_at) or real app usage (profiles.last_active_at, a
    // heartbeat touched by most mobile actions). A PWA session persists across app
    // opens — reopening it silently resumes the session without a fresh sign-in — so
    // last_sign_in_at alone can look stale for weeks even though the engineer is
    // actively using the app every day; last_active_at is what actually moves.
    const merge = (rows: Record<string, unknown>[]) =>
      rows.map(r => {
        const signIn = signInMap[r.id as string] ?? null
        const active = (r.last_active_at as string | null) ?? null
        const lastLoginAt = signIn && active
          ? (new Date(active) > new Date(signIn) ? active : signIn)
          : (active ?? signIn ?? (r.last_login_at as string | null) ?? null)
        return { ...r, last_login_at: lastLoginAt }
      })

    // Get caller role + all profiles in parallel
    const [{ data: profile }, { data, error }] = await Promise.all([
      sb.from('profiles').select('role').eq('id', user.id).single(),
      admin.from('profiles').select('*').order('created_at', { ascending: false }),
    ])

    if (profile?.role === 'Service Manager') {
      const { data: managed, error: me } = await admin
        .from('profiles')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      return { users: merge((managed as Record<string, unknown>[]) || []), error: me?.message || null }
    }

    return { users: merge((data as Record<string, unknown>[]) || []), error: error?.message || null }
  } catch (e: unknown) {
    return { users: [], error: e instanceof Error ? e.message : String(e) }
  }
}
