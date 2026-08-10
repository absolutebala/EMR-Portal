import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from './core/shared'
import { mustChangePasswordCore } from './core/auth'

// Mobile equivalent of the desktop (app)/layout.tsx must_change_password redirect gate —
// mobile has no shared layout guard (each page does its own auth check), so every
// mobile page that requires auth must also call this right after confirming the user
// is signed in. Without it, invited/reset field engineers who only ever use the PWA
// never clear must_change_password, which also hides their Last Login on the desktop
// Users page (that column is gated on !must_change_password). The check itself lives
// in mustChangePasswordCore (lib/mobile/core/auth.ts) so the React Native app's
// GET /api/mobile/v1/auth/me route can reuse the exact same logic as a JSON flag
// instead of a server-side redirect, which RN has no equivalent for.
export async function requireMobilePasswordChanged(_sb: SupabaseClient, userId: string) {
  const mustChange = await mustChangePasswordCore(adminClient(), userId)
  if (mustChange) redirect('/mobile/change-password')
}
