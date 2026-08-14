'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

// Cognito's ListUsers has no equivalent to Supabase's auth.users.last_sign_in_at, so
// there's nothing useful left to merge in from a Cognito call here at all (the old
// merge preferred profiles.last_active_at over it anyway — "a PWA session persists
// across app opens, so last_sign_in_at alone can look stale for weeks even though the
// engineer is actively using the app every day"). last_active_at is touched by most
// mobile actions already; profiles.last_login_at is now written directly by
// app/actions/login.ts and complete-new-password.ts on successful web sign-in instead.
export async function getUsers(): Promise<{ users: unknown[]; error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { users: [], error: 'Not authenticated.' }

    const admin = adminClient()

    const withRecency = (rows: Record<string, unknown>[]) =>
      rows.map(r => ({ ...r, last_login_at: (r.last_active_at as string | null) ?? (r.last_login_at as string | null) ?? null }))

    const [{ data: profile }, { data, error }] = await Promise.all([
      admin.from('profiles').select('role').eq('id', user.id).single(),
      admin.from('profiles').select('*').order('created_at', { ascending: false }),
    ])

    if (profile?.role === 'Service Manager') {
      const { data: managed, error: me } = await admin
        .from('profiles')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      return { users: withRecency((managed as Record<string, unknown>[]) || []), error: me?.message || null }
    }

    return { users: withRecency((data as Record<string, unknown>[]) || []), error: error?.message || null }
  } catch (e: unknown) {
    return { users: [], error: e instanceof Error ? e.message : String(e) }
  }
}
