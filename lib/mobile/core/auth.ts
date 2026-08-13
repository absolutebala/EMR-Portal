import type { AdminClient } from './shared'

export async function completePasswordChangeCore(admin: AdminClient, userId: string): Promise<{ error: string | null }> {
  // profiles.must_change_password is the sole source of truth (Cognito has no
  // equivalent to Supabase's user_metadata sync this used to also perform).
  const { error: profileError } = await admin
    .from('profiles')
    .update({ must_change_password: false, invite_pending: false })
    .eq('id', userId)
  if (profileError) return { error: profileError.message }
  return { error: null }
}

// Mobile equivalent of the desktop (app)/layout.tsx must_change_password gate — mobile
// has no shared layout guard (each page/route does its own auth check), so every
// caller must check this explicitly. The PWA wraps this in a Next redirect()
// (lib/mobile/authGuard.ts); the React Native app gets it as a plain JSON flag from
// GET /api/mobile/v1/auth/me and navigates to its own change-password screen itself.
export async function mustChangePasswordCore(admin: AdminClient, userId: string): Promise<boolean> {
  const { data: profile } = await admin.from('profiles').select('must_change_password').eq('id', userId).single()
  return !!profile?.must_change_password
}
