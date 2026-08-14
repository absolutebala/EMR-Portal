import { headers } from 'next/headers'

export interface AuthedUser {
  id: string
  email: string
}

// proxy.ts already verifies the ID token's signature (locally, against cached JWKS —
// no network round trip) for every request before it reaches here, and stashes the
// decoded claims in a request header. Reading that header is a request-scoped, no-op
// re-verification — same trust rationale the old lib/supabase/server.ts documented for
// reading getSession() instead of re-calling auth.getUser(). Do not use this pattern in
// proxy.ts itself, which is the one place that must actually verify the token.
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const h = await headers()
  const raw = h.get('x-emr-user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthedUser
  } catch {
    return null
  }
}
