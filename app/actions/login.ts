'use server'

import { InitiateAuthCommand, AuthFlowType, NotAuthorizedException, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'
import { getIdVerifier } from '@/lib/cognito/verifier'
import { setSessionCookie, setChallengeCookie, clearSessionCookie } from '@/lib/cognito/session'
import { adminClient } from '@/lib/db/admin-client'

export type LoginResult =
  | { status: 'ok' }
  | { status: 'challenge' }
  | { status: 'error'; error: string }

// Not exported — a 'use server' file's compiler expects every top-level export to be
// an async function (a plain constant export has broken the build before, see the
// similar note in mobile-actions.ts); complete-new-password.ts duplicates this literal
// rather than importing it.
const MOBILE_ONLY_MESSAGE = 'This mobile app is only for Field Engineers. Please access the application from your computer: https://portal.emr.global/login'

// Moved server-side (was a client-side supabase.auth.signInWithPassword call) —
// simpler than shipping the Cognito SDK to the browser, no downside since this always
// ran inside the Next.js app anyway.
//
// requireRole is only passed by the mobile login page — the desktop login stays open
// to every role. A non-matching role still completes the Cognito auth (there's no way
// to check role before that), so the just-set session cookie is torn back down before
// returning the error, leaving the rejected user fully signed out rather than holding
// a live session they were just told they can't use.
export async function login(email: string, password: string, options?: { requireRole?: string }): Promise<LoginResult> {
  try {
    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: COGNITO_WEB_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }))

    // Temp-password (newly invited, or admin-reset) users land here instead of
    // getting tokens directly — see app/set-password/page.tsx for the completion step.
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      if (!result.Session) return { status: 'error', error: 'Could not start password setup. Please try again.' }
      await setChallengeCookie({ session: result.Session, email })
      return { status: 'challenge' }
    }

    const auth = result.AuthenticationResult
    if (!auth?.IdToken || !auth?.AccessToken || !auth?.RefreshToken) {
      return { status: 'error', error: 'Sign-in failed. Please try again.' }
    }
    await setSessionCookie({ idToken: auth.IdToken, accessToken: auth.AccessToken, refreshToken: auth.RefreshToken })

    if (options?.requireRole) {
      try {
        const payload = await getIdVerifier().verify(auth.IdToken)
        const { data: profile } = await adminClient().from('profiles').select('role').eq('cognito_sub', payload.sub).maybeSingle()
        if (profile?.role !== options.requireRole) {
          await clearSessionCookie()
          return { status: 'error', error: MOBILE_ONLY_MESSAGE }
        }
      } catch {
        await clearSessionCookie()
        return { status: 'error', error: 'Could not verify account access. Please try again.' }
      }
    }

    // Best-effort — a failure here shouldn't block sign-in. Cognito has no
    // last_sign_in_at equivalent to read back (see get-users.ts), so this is the
    // write side of that same value.
    try {
      const payload = await getIdVerifier().verify(auth.IdToken)
      await adminClient().from('profiles').update({ last_login_at: new Date().toISOString() }).eq('cognito_sub', payload.sub)
    } catch {
      // best-effort only
    }

    return { status: 'ok' }
  } catch (e: unknown) {
    if (e instanceof NotAuthorizedException || e instanceof UserNotFoundException) {
      return { status: 'error', error: 'Incorrect email or password.' }
    }
    return { status: 'error', error: e instanceof Error ? e.message : 'Sign-in failed.' }
  }
}
