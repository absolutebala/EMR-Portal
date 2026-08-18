'use server'

import { RespondToAuthChallengeCommand, ChallengeNameType } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'
import { getIdVerifier } from '@/lib/cognito/verifier'
import { getChallengeCookie, clearChallengeCookie, setSessionCookie } from '@/lib/cognito/session'
import { adminClient } from '@/lib/db/admin-client'

// Duplicated from login.ts rather than imported — a 'use server' file's compiler
// expects every top-level export to be an async function, so a plain constant can't
// safely be re-exported from that file.
const MOBILE_ONLY_MESSAGE = 'This mobile app is only for Field Engineers. Please access the application from your computer: https://portal.emr.global/login'

// Completes the NEW_PASSWORD_REQUIRED challenge login() started (see
// app/actions/login.ts) — the single form every temp-password user (freshly invited,
// or admin-reset) goes through now, replacing the old set-password page's three
// separate Supabase-link mechanisms and the desktop/mobile change-password pages'
// separate "already authenticated, just update the password" flow. Cognito never
// issues real tokens for a temp-password user until this challenge is answered, so
// there is no "already signed in, now let them change it" state to handle anymore.
export async function completeNewPassword(newPassword: string, options?: { requireRole?: string }): Promise<{ error: string | null }> {
  const challenge = await getChallengeCookie()
  if (!challenge) return { error: 'Your session has expired. Please sign in again.' }

  try {
    const result = await cognitoClient.send(new RespondToAuthChallengeCommand({
      ClientId: COGNITO_WEB_CLIENT_ID,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: challenge.session,
      ChallengeResponses: { USERNAME: challenge.email, NEW_PASSWORD: newPassword },
    }))

    const auth = result.AuthenticationResult
    if (!auth?.IdToken || !auth?.AccessToken || !auth?.RefreshToken) {
      return { error: 'Could not set your password. Please try again.' }
    }

    const payload = await getIdVerifier().verify(auth.IdToken)

    if (options?.requireRole) {
      const { data: profile } = await adminClient().from('profiles').select('role').eq('cognito_sub', payload.sub).maybeSingle()
      if (profile?.role !== options.requireRole) {
        await clearChallengeCookie()
        return { error: MOBILE_ONLY_MESSAGE }
      }
    }

    await setSessionCookie({ idToken: auth.IdToken, accessToken: auth.AccessToken, refreshToken: auth.RefreshToken })
    await clearChallengeCookie()

    // profiles.cognito_sub links this Cognito identity to its legacy profile row —
    // set at invite time for new users, or by the Migrate-User Lambda's first-login
    // trigger for accounts migrated from Supabase (see proxy.ts's resolveProfileUser
    // for the read side of this same mapping).
    await adminClient()
      .from('profiles')
      .update({ must_change_password: false, invite_pending: false, last_login_at: new Date().toISOString() })
      .eq('cognito_sub', payload.sub)

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not set your password.' }
  }
}
