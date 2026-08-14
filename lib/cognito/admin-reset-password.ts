import { randomBytes } from 'crypto'
import { AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from './client'
import { COGNITO_USER_POOL_ID } from './config'
import { adminClient } from '@/lib/db/admin-client'

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '@#$!'
  const all = upper + lower + digits + special
  const bytes = randomBytes(8)
  const chars = Array.from(bytes).map(b => all[b % all.length])
  chars[0] = upper[randomBytes(1)[0] % upper.length]
  chars[1] = lower[randomBytes(1)[0] % lower.length]
  chars[2] = digits[randomBytes(1)[0] % digits.length]
  chars[3] = special[randomBytes(1)[0] % special.length]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Shared by app/actions/reset-user-password.ts and resend-invite.ts (near-duplicates
// before this migration, differing only in whether invite_pending also gets set) —
// AdminSetUserPasswordCommand(Permanent: false) puts the user back into Cognito's
// FORCE_CHANGE_PASSWORD status, so their next login hits the same
// NEW_PASSWORD_REQUIRED challenge a fresh invite does (see app/actions/login.ts).
export async function adminResetPassword(email: string, extraProfileFields: Record<string, unknown> = {}): Promise<{ error: string | null; tempPassword?: string }> {
  const admin = adminClient()
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return { error: 'User not found.' }

  const tempPassword = generateTempPassword()

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
