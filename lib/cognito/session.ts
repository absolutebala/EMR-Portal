import { cookies } from 'next/headers'

export interface SessionTokens {
  idToken: string
  accessToken: string
  refreshToken: string
}

const SESSION_COOKIE = 'emr_session'
const CHALLENGE_COOKIE = 'emr_challenge'

// Matches the ALB-has-no-domain/cert-yet constraint already accepted for
// NEXT_PUBLIC_SITE_URL being http:// today (see service-stack.ts) — flip this on once
// Phase I gives the ALB a real domain+cert.
const SECURE_COOKIES = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://') ?? false

// Server Action / Route Handler only — next/headers' cookies() can't be mutated from a
// Server Component. Cookie lifetime tracks the refresh token (30 days, see
// auth-stack.ts's refreshTokenValidity); the id/access tokens inside it get silently
// replaced well before their own 1-hour expiry by proxy.ts's refresh-on-expiry check.
export async function setSessionCookie(tokens: SessionTokens): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function getSessionCookie(): Promise<SessionTokens | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionTokens
  } catch {
    return null
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export interface ChallengeState {
  session: string
  email: string
}

// Short-lived — only needs to survive the redirect from /login (or /mobile/login) to
// the password-set page immediately after a NEW_PASSWORD_REQUIRED challenge.
export async function setChallengeCookie(state: ChallengeState): Promise<void> {
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  })
}

export async function getChallengeCookie(): Promise<ChallengeState | null> {
  const store = await cookies()
  const raw = store.get(CHALLENGE_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as ChallengeState
  } catch {
    return null
  }
}

export async function clearChallengeCookie(): Promise<void> {
  const store = await cookies()
  store.delete(CHALLENGE_COOKIE)
}
