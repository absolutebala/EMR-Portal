import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerSession } from '@/lib/mobile/apiAuth'
import { adminClient, getEngineerName } from '@/lib/mobile/core/shared'
import { mustChangePasswordCore } from '@/lib/mobile/core/auth'

export async function GET(req: NextRequest) {
  // Non-rejecting resolve so a displaced session gets a friendly sign-out response
  // instead of a bare 401 (which the app would just treat as a transient error).
  const session = await resolveBearerSession(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Single-device enforcement: this engineer signed in on a newer device, so this one
  // is superseded. Return a sentinel role (!== 'Field Engineer') so EXISTING app builds
  // — which already sign themselves out and return to login whenever the role isn't
  // Field Engineer — do so here too, no app update required. New builds additionally
  // read `sessionSuperseded` to show the precise "signed in on another device" message.
  if (session.displaced) {
    return NextResponse.json({
      userId: null,
      mustChangePassword: false,
      engineer: null,
      role: 'SESSION_SUPERSEDED',
      sessionSuperseded: true,
      error: null,
    })
  }

  const user = { id: session.id }
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
  return NextResponse.json({ userId: user.id, mustChangePassword, engineer, role: profile?.role ?? null, error: null })
}
