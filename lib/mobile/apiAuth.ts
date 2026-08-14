import type { NextRequest } from 'next/server'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { COGNITO_USER_POOL_ID, COGNITO_MOBILE_CLIENT_ID } from '@/lib/cognito/config'
import { adminClient } from '@/lib/db/admin-client'

export interface BearerUser {
  id: string
}

// Bearer-token auth for the React Native app's REST routes (app/api/mobile/v1/*).
// Unlike the cookie-session flow (proxy.ts verifies once per request and stashes
// claims in a header for lib/cognito/server.ts's getAuthedUser to trust), a bearer
// request has no upstream verification to lean on — it arrives at this route
// directly, so this verification IS the live check. Local against Cognito's JWKS
// (cached per container), not a network round trip — a real improvement over the old
// Supabase-based version, which called out to Supabase Auth's live API on every one
// of these (the highest-QPS auth path in the app: checkins, dashboard polls, etc.).
const accessVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: COGNITO_MOBILE_CLIENT_ID,
})

export async function resolveBearerUser(req: NextRequest): Promise<BearerUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  if (!token) return null

  try {
    const payload = await accessVerifier.verify(token)
    // profiles.cognito_sub links this Cognito identity to its legacy profile row —
    // same mapping proxy.ts's resolveProfileUser reads for the cookie-session path.
    // Access tokens carry no email claim, only sub, so there's nothing else to return.
    const { data } = await adminClient().from('profiles').select('id').eq('cognito_sub', payload.sub).maybeSingle()
    if (!data) return null
    return { id: data.id }
  } catch {
    return null
  }
}
