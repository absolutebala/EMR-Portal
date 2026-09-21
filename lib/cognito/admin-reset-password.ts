import { AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from './client'
import { COGNITO_USER_POOL_ID } from './config'
import { DEFAULT_TEMP_PASSWORD } from './tempPassword'
import { adminClient } from '@/lib/db/admin-client'

// Shared by app/actions/reset-user-password.ts and resend-invite.ts (near-duplicates
// before this migration, differing only in whether invite_pending also gets set) —
// AdminSetUserPasswordCommand(Permanent: false) puts the user back into Cognito's
// FORCE_CHANGE_PASSWORD status, so their next login hits the same
// NEW_PASSWORD_REQUIRED challenge a fresh invite does (see app/actions/login.ts).
export async function adminResetPassword(email: string, extraProfileFields: Record<string, unknown> = {}): Promise<{ error: string | null; tempPassword?: string }> {
  const admin = adminClient()
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return { error: 'User not found.' }

  const tempPassword = DEFAULT_TEMP_PASSWORD

  try {
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: email,
      Password: tempPassword,
      Permanent: false,
    }))
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not reset the password.' }
  }

  await admin.from('profiles').update({ must_change_password: true, ...extraProfileFields }).eq('id', profile.id)

  return { error: null, tempPassword }
}

// Set a permanent password the user chose themselves (Permanent: true, no
// FORCE_CHANGE_PASSWORD challenge on next login) — unlike adminResetPassword's temporary
// value. Used by the mobile OTP self-service reset (lib/mobile/core/passwordReset.ts):
// the engineer has already proven ownership of their number via the OTP, so they log in
// straight away with the new password. Clears must_change_password too.
export async function adminSetPermanentPassword(email: string, password: string): Promise<{ error: string | null }> {
  const admin = adminClient()
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return { error: 'User not found.' }

  try {
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    }))
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not set the password.' }
  }

  await admin.from('profiles').update({ must_change_password: false }).eq('id', profile.id)
  return { error: null }
}
