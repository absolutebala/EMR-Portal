import { NextResponse, type NextRequest } from 'next/server'
import { InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider'
import { COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'
import { idVerifier } from '@/lib/cognito/verifier'
import { cognitoClient } from '@/lib/cognito/client'
import { adminClient } from '@/lib/db/admin-client'

// The one place in the app that actually verifies a token's signature — everywhere
// else (lib/cognito/server.ts's getAuthedUser) just trusts the x-emr-user header this
// sets, the same "verify once per request, trust downstream" pattern the old
// Supabase-based proxy.ts used. Verification is local against Cognito's JWKS (fetched
// once, cached in memory for the life of this container) — not a network round trip
// per request, unlike Supabase's old auth.getUser().

const SESSION_COOKIE = 'emr_session'
const SECURE_COOKIES = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://') ?? false

interface SessionTokens {
  idToken: string
  accessToken: string
  refreshToken: string
}

function readSessionCookie(request: NextRequest): SessionTokens | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionTokens
  } catch {
    return null
  }
}

// Cognito's `sub` is a freshly-generated UUID with no inherent relationship to
// profiles.id (the legacy Supabase auth.users id, preserved as-is through the Phase C
// data migration) — profiles.cognito_sub is the mapping column that links them (set at
// invite time for new Cognito-native users, or by the Migrate-User Lambda on first
// login for accounts migrated from Supabase). Re-derived from the verified token's
// `sub` on every request rather than trusted from the session cookie itself: the
// cookie is httpOnly (safe from JS/XSS) but not tamper-proof against a client who
// edits it directly (e.g. via browser devtools), so a cookie-stored profile id could
// be swapped to someone else's while keeping a legitimately-issued token.
async function resolveProfileUser(sub: string, email: string): Promise<{ id: string; email: string } | null> {
  try {
    const { data } = await adminClient().from('profiles').select('id').eq('cognito_sub', sub).maybeSingle()
    if (!data) return null
    return { id: data.id, email }
  } catch {
    return null
  }
}

async function refreshSession(refreshToken: string): Promise<SessionTokens | null> {
  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: COGNITO_WEB_CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }))
    const auth = result.AuthenticationResult
    if (!auth?.IdToken || !auth?.AccessToken) return null
    return { idToken: auth.IdToken, accessToken: auth.AccessToken, refreshToken }
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  // ALB hits this every 15-30s — skip Cognito verification entirely rather than
  // paying it on every health-check poll for the lifetime of the deployment.
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next({ request })
  }

  // Phase I cutover switch — blocks the whole app (not just writes: simpler and safer
  // to reason about under time pressure than trying to distinguish GET from
  // mutation-carrying requests) while the Supabase -> RDS/Cognito data migration runs,
  // so no write can land on Supabase after the final sync snapshot is taken. Flip back
  // to 'false' (a plain env var update, no image rebuild needed) once verified live.
  if (process.env.MAINTENANCE_MODE === 'true') {
    return new NextResponse(
      '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><h2>EMR Portal is briefly offline for maintenance</h2><p>Back shortly — please try again in a few minutes.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html', 'Retry-After': '120' } }
    )
  }

  const { pathname } = request.nextUrl

  const tokens = readSessionCookie(request)
  let user: { id: string; email: string } | null = null
  let refreshedTokens: SessionTokens | null = null

  if (tokens) {
    try {
      const payload = await idVerifier.verify(tokens.idToken)
      user = await resolveProfileUser(payload.sub, (payload.email as string) ?? '')
    } catch {
      // Expired or invalid — try once to refresh before treating this as signed out.
      const refreshed = await refreshSession(tokens.refreshToken)
      if (refreshed) {
        try {
          const payload = await idVerifier.verify(refreshed.idToken)
          user = await resolveProfileUser(payload.sub, (payload.email as string) ?? '')
          refreshedTokens = refreshed
        } catch {
          user = null
        }
      }
    }
  }

  // Mobile PWA has its own auth guard per page/route and its own login screen
  const isMobilePublic = pathname.startsWith('/mobile') || pathname === '/sw.js' || pathname === '/manifest.webmanifest'

  // API routes handle their own auth (cookie-session via getAuthedUser, or bearer-token
  // via resolveBearerUser for the React Native app) and must return JSON, never a 302 —
  // a redirect response is useless to a fetch client and was actively breaking
  // unauthenticated hits to routes like the cron endpoint, which has no session cookie
  // at all and never got a chance to run its own logic before this block intercepted it.
  const isApiPath = pathname.startsWith('/api/')

  // The bare homepage must reach app/page.tsx even when signed out — it does its own
  // device check there (mobile UA -> /mobile/install, desktop -> /dashboard). Without
  // this exemption, every unauthenticated visit to "/" was bounced straight to /login
  // by this same block before that redirect logic ever got a chance to run, on both
  // desktop and mobile alike.
  if (!user && !isMobilePublic && !isApiPath && pathname !== '/' && !pathname.startsWith('/login') && !pathname.startsWith('/set-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  const requestHeaders = new Headers(request.headers)
  if (user) requestHeaders.set('x-emr-user', JSON.stringify(user))
  else requestHeaders.delete('x-emr-user')

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (refreshedTokens) {
    response.cookies.set(SESSION_COOKIE, JSON.stringify(refreshedTokens), {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
