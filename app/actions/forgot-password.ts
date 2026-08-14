'use server'

import { ForgotPasswordCommand, ConfirmForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'

// Cognito's self-service reset is code-based (a 6-digit code emailed, entered
// alongside the new password) rather than Supabase's link-based flow — a real UX
// shape change, but same account-recovery capability (Cognito's User Pool is already
// configured with AccountRecovery.EMAIL_ONLY for this). Always reports success even if
// the email doesn't exist, matching Cognito's own default behavior — don't leak which
// emails are registered.
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  try {
    await cognitoClient.send(new ForgotPasswordCommand({ ClientId: COGNITO_WEB_CLIENT_ID, Username: email }))
    return { error: null }
  } catch {
    return { error: null }
  }
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    await cognitoClient.send(new ConfirmForgotPasswordCommand({
      ClientId: COGNITO_WEB_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }))
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not reset your password. Please check the code and try again.' }
  }
}
