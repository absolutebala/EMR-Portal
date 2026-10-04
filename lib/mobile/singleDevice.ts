import type { AdminClient } from './core/shared'

// Single-device login enforcement (Field Engineers only). See migration 118 for the
// full rationale. Identity = the token's origin_jti (one per login, constant across all
// refreshes of that login); ordering = auth_time (the login instant, also constant
// across refreshes). The newest login wins; an older device can never reclaim because
// its auth_time is never greater than the active one — which makes this entirely
// race-free (call ordering doesn't matter) and refresh-proof (a genuine single-device
// engineer keeps the same origin_jti/auth_time forever, so is never flagged displaced).

export interface SessionClaims {
  originJti: string | null
  authTime: number | null
}

// Decode a JWT's payload claims WITHOUT verifying the signature — callers must only use
// this on a token whose signature was already verified upstream (the bearer verifier in
// apiAuth.ts, or proxy.ts for the cookie session). We just need origin_jti/auth_time,
// which aws-jwt-verify doesn't type on its return value.
export function sessionClaimsFromJwt(token: string | undefined | null): SessionClaims {
  if (!token) return { originJti: null, authTime: null }
  try {
    const part = token.split('.')[1]
    if (!part) return { originJti: null, authTime: null }
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const c = JSON.parse(json) as { origin_jti?: string; auth_time?: number }
    return {
      originJti: typeof c.origin_jti === 'string' ? c.origin_jti : null,
      authTime: typeof c.auth_time === 'number' ? c.auth_time : null,
    }
  } catch {
    return { originJti: null, authTime: null }
  }
}

// Claims the account for this session when it's the newest login (monotonic by
// auth_time — writes only on the first request of a fresh login, then never again),
// and reports whether this session is a displaced, older one that a newer login has
// superseded. Field-Engineer-only: every other role is always allowed and never claims,
// so admins using desktop + mobile together are never affected.
//
// Fail-open by construction: if the role isn't FE, the claims are missing, or the
// profile read errors (e.g. the new columns aren't in the PostgREST cache yet), this
// returns displaced:false — a bug here can never lock out a genuine user.
export async function evaluateSingleDevice(
  admin: AdminClient,
  userId: string,
  role: string | null,
  claims: SessionClaims,
): Promise<{ displaced: boolean }> {
  if (role !== 'Field Engineer') return { displaced: false }
  const { originJti, authTime } = claims
  if (!originJti || typeof authTime !== 'number') return { displaced: false }

  const { data, error } = await admin
    .from('profiles')
    .select('active_session_id, active_auth_time')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return { displaced: false }

  const activeId = (data.active_session_id as string | null) ?? null
  const activeAt = (data.active_auth_time as number | null) ?? null

  if (activeId === originJti) return { displaced: false } // our own, already-active session

  if (activeId === null || authTime > (activeAt ?? 0)) {
    // Newest login (or first ever) — claim the account. Fire-and-forget: a failed write
    // just means enforcement activates on a later request, never a blocked user.
    admin.from('profiles')
      .update({ active_session_id: originJti, active_auth_time: authTime })
      .eq('id', userId)
      .then(() => {}, () => {})
    return { displaced: false }
  }

  // A different session that is NOT newer than the active one → displaced.
  return { displaced: true }
}
