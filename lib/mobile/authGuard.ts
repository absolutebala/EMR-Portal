import { redirect } from 'next/navigation'
import { adminClient } from './core/shared'
import { mustChangePasswordCore } from './core/auth'
import { getSessionCookie } from '@/lib/cognito/session'
import { sessionClaimsFromJwt, evaluateSingleDevice } from './singleDevice'

// Mobile equivalent of the desktop (app)/layout.tsx must_change_password redirect gate —
// mobile has no shared layout guard (each page does its own auth check), so every
// mobile page that requires auth must also call this right after confirming the user
// is signed in. Without it, invited/reset field engineers who only ever use the PWA
// never clear must_change_password, which also hides their Last Login on the desktop
// Users page (that column is gated on !must_change_password). The check itself lives
// in mustChangePasswordCore (lib/mobile/core/auth.ts) so the React Native app's
// GET /api/mobile/v1/auth/me route can reuse the exact same logic as a JSON flag
// instead of a server-side redirect, which RN has no equivalent for.
export async function requireMobilePasswordChanged(userId: string) {
  const admin = adminClient()

  // Single-device enforcement (Field Engineers only — evaluateSingleDevice no-ops for
  // every other role, so this never affects an admin's browser session). The cookie's
  // access token was already signature-verified by proxy.ts; we only read its claims
  // (origin_jti / auth_time) here. If a newer login elsewhere has superseded this
  // browser session, bounce it to login — and claim the account here on the newest
  // login so a PWA sign-in likewise displaces the native app. Reading cookies in a
  // Server Component is fine; clearing them isn't, so we just redirect (the stale
  // cookie grants nothing the guard now allows, and the next login overwrites it).
  const session = await getSessionCookie()
  if (session) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    const { displaced } = await evaluateSingleDevice(admin, userId, profile?.role ?? null, sessionClaimsFromJwt(session.accessToken))
    if (displaced) redirect('/mobile/login?reason=signed_in_elsewhere')
  }

  const mustChange = await mustChangePasswordCore(admin, userId)
  if (mustChange) redirect('/mobile/change-password')
}
