import type { AdminClient } from './shared'

export async function completePasswordChangeCore(
  admin: AdminClient,
  userId: string,
  phone?: string | null,
): Promise<{ error: string | null }> {
  // Every field engineer must have a mobile number on file (it's how password-reset OTPs
  // reach them). We capture it on this first-login screen: require a valid 10-digit number
  // unless the profile already has one saved.
  const { data: existing } = await admin.from('profiles').select('phone').eq('id', userId).maybeSingle()
  const alreadyHasPhone = !!(existing?.phone && existing.phone.replace(/\D/g, '').length >= 10)
  const cleaned = (phone ?? '').trim()
  const cleanedDigits = cleaned.replace(/\D/g, '')

  if (!alreadyHasPhone) {
    if (!cleaned) return { error: 'A mobile number is required.' }
    if (cleanedDigits.length < 10) return { error: 'Enter a valid 10-digit mobile number.' }
  }

  // profiles.must_change_password is the sole source of truth (Cognito has no
  // equivalent to Supabase's user_metadata sync this used to also perform).
  const update: { must_change_password: boolean; invite_pending: boolean; phone?: string } = {
    must_change_password: false,
    invite_pending: false,
  }
  if (cleanedDigits.length >= 10) update.phone = cleaned

  const { error: profileError } = await admin
    .from('profiles')
    .update(update)
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
