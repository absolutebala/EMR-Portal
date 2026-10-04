import type { NextRequest } from 'next/server'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { COGNITO_USER_POOL_ID, COGNITO_MOBILE_CLIENT_ID } from '@/lib/cognito/config'
import { adminClient } from '@/lib/db/admin-client'
import { evaluateSingleDevice } from '@/lib/mobile/singleDevice'

export interface BearerUser {
  id: string
}

// Like BearerUser but never rejects on single-device displacement — it reports it via
// `displaced` instead, so GET /auth/me can return a friendly "signed in elsewhere"
// response (that cleanly signs the old app out) rather than a bare 401.
export interface BearerSession {
  id: string
  role: string | null
  displaced: boolean
}

// Bearer-token auth for the React Native app's REST routes (app/api/mobile/v1/*).
// Unlike the cookie-session flow (proxy.ts verifies once per request and stashes
// claims in a header for lib/cognito/server.ts's getAuthedUser to trust), a bearer
// request has no upstream verification to lean on — it arrives at this route
// directly, so this verification IS the live check. Local against Cognito's JWKS
// (cached per container), not a network round trip — a real improvement over the old
// Supabase-based version, which called out to Supabase Auth's live API on every one
// of these (the highest-QPS auth path in the app: checkins, dashboard polls, etc.).
//
// Lazy (not built at module scope) — Next.js's build step statically evaluates every
// route module, including this one, inside the Docker build where
// COGNITO_USER_POOL_ID isn't set (runtime-only ECS env var, not a build arg). Building
// the verifier eagerly crashed the build with "Cannot read properties of undefined
// (reading 'match')" from CognitoJwtVerifier.create() parsing an undefined pool id.
let cachedAccessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined
function getAccessVerifier() {
  if (!cachedAccessVerifier) {
    cachedAccessVerifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: 'access',
      clientId: COGNITO_MOBILE_CLIENT_ID,
    })
  }
  return cachedAccessVerifier
}

// Verifies the bearer access token, resolves it to a profile, and runs single-device
// evaluation (which also claims the account for the newest login). Does NOT reject on
// displacement — returns `displaced` so callers decide how to react. null only for a
// missing/invalid token or an unknown profile.
async function verifyBearerSession(req: NextRequest): Promise<BearerSession | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  if (!token) return null

  try {
    const payload = await getAccessVerifier().verify(token)
    // profiles.cognito_sub links this Cognito identity to its legacy profile row —
    // same mapping proxy.ts's resolveProfileUser reads for the cookie-session path.
    // Access tokens carry no email claim, only sub, so there's nothing else to return.
    const { data } = await adminClient().from('profiles').select('id, role').eq('cognito_sub', payload.sub).maybeSingle()
    if (!data) return null
    // origin_jti/auth_time aren't on aws-jwt-verify's typed payload, but Cognito access
    // tokens always carry them — origin_jti is the per-login id (stable across refresh),
    // auth_time the login instant (also stable across refresh).
    const claims = payload as unknown as { origin_jti?: string; auth_time?: number }
    const { displaced } = await evaluateSingleDevice(adminClient(), data.id, data.role ?? null, {
      originJti: typeof claims.origin_jti === 'string' ? claims.origin_jti : null,
      authTime: typeof claims.auth_time === 'number' ? claims.auth_time : null,
    })
    return { id: data.id, role: data.role ?? null, displaced }
  } catch {
    return null
  }
}

// The high-QPS auth path for every app/api/mobile/v1/* route. A displaced
// (signed-in-elsewhere) Field-Engineer session is treated exactly like an invalid one —
// returns null → the route's standard 401 → the app's data calls stop working on the
// old device the moment someone logs in elsewhere.
export async function resolveBearerUser(req: NextRequest): Promise<BearerUser | null> {
  const session = await verifyBearerSession(req)
  if (!session) return null
  if (session.displaced) return null
  return { id: session.id }
}

// Non-rejecting variant for GET /auth/me only — see BearerSession.
export async function resolveBearerSession(req: NextRequest): Promise<BearerSession | null> {
  return verifyBearerSession(req)
}
