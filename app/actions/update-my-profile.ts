'use server'

import { AdminInitiateAuthCommand, AdminSetUserPasswordCommand, AuthFlowType, NotAuthorizedException } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_USER_POOL_ID, COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'
import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

export async function updateMyProfile(updates: {
  first_name: string
  last_name: string
  phone: string | null
}): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }
    const { error } = await adminClient().from('profiles').update(updates).eq('id', user.id)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user?.email) return { error: 'Not authenticated' }

    // Verify the current password without touching the caller's own session cookie —
    // stays server-side, no ClientId round-trip to the browser needed.
    try {
      await cognitoClient.send(new AdminInitiateAuthCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        ClientId: COGNITO_WEB_CLIENT_ID,
        AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
        AuthParameters: { USERNAME: user.email, PASSWORD: currentPassword },
      }))
    } catch (e: unknown) {
      if (e instanceof NotAuthorizedException) return { error: 'Current password is incorrect.' }
      throw e
    }

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: user.email,
      Password: newPassword,
      Permanent: true,
    }))

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
