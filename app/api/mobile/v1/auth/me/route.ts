import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient, getEngineerName } from '@/lib/mobile/core/shared'
import { mustChangePasswordCore } from '@/lib/mobile/core/auth'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = adminClient()

  // Record the mobile sign-in. The native app authenticates directly against Cognito
  // on-device, so — unlike the web login action (app/actions/login.ts) — nothing else
  // marks the account as onboarded/active. This endpoint runs on every mobile session
  // (fresh login, challenge completion, app resume), so clearing invite_pending and
  // stamping last_login_at here is what makes the desktop Users page stop showing a
  // logged-in field engineer as "invite pending". Fire-and-forget so it never delays
  // the response, and idempotent so repeated calls are harmless.
  admin.from('profiles')
    .update({ invite_pending: false, last_login_at: new Date().toISOString() })
    .eq('id', user.id)
    .then(() => {}, () => {})

  const [mustChangePassword, engineer, { data: profile }] = await Promise.all([
    mustChangePasswordCore(admin, user.id),
    getEngineerName(admin, user.id),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])

  // The RN app is Field-Engineer-only — AuthContext.tsx signs out and blocks access
  // for any other role using this field, same restriction the PWA's login/challenge
  // actions enforce server-side before ever setting a session cookie.
  return NextResponse.json({ mustChangePassword, engineer, role: profile?.role ?? null, error: null })
}
