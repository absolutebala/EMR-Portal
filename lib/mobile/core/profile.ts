import { AdminInitiateAuthCommand, AdminSetUserPasswordCommand, AuthFlowType, NotAuthorizedException } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_USER_POOL_ID, COGNITO_WEB_CLIENT_ID } from '@/lib/cognito/config'
import { uploadAsset } from '@/lib/storage/s3'
import { type AdminClient, withTimeout } from './shared'

export interface MyProfile {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  avatarUrl: string | null
}

// Shared by the web "my profile" action and the mobile Profile screen — same
// {id -> profile row} shape used by getEngineerName elsewhere, just with the extra
// fields (email, phone, avatar) that a self-service profile view needs but a job list
// or dashboard greeting doesn't.
export async function getMyProfileCore(admin: AdminClient, userId: string): Promise<{ profile: MyProfile | null; error: string | null }> {
  try {
    const { data, error } = await admin.from('profiles').select('first_name, last_name, email, phone, avatar_url').eq('id', userId).maybeSingle()
    if (error) return { profile: null, error: error.message }
    if (!data) return { profile: null, error: 'Profile not found' }
    return {
      profile: { firstName: data.first_name, lastName: data.last_name, email: data.email, phone: data.phone, avatarUrl: data.avatar_url },
      error: null,
    }
  } catch (e: unknown) {
    return { profile: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// Email is deliberately not editable here — it's the Cognito username, changing it is
// a separate (and much more involved) identity operation than this form covers.
export async function updateMyProfileCore(admin: AdminClient, userId: string, updates: { firstName: string; lastName: string; phone: string | null }): Promise<{ error: string | null }> {
  try {
    const { error } = await admin.from('profiles').update({
      first_name: updates.firstName, last_name: updates.lastName, phone: updates.phone,
    }).eq('id', userId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function uploadMyAvatarCore(admin: AdminClient, userId: string, photo: { base64: string; mimeType: string; ext: string }): Promise<{ url: string | null; error: string | null }> {
  try {
    const base64 = photo.base64.split(',')[1] ?? photo.base64
    const buffer = Buffer.from(base64, 'base64')
    const path = `avatars/${userId}-${Date.now()}.${photo.ext}`
    const url = await withTimeout(uploadAsset(path, buffer, photo.mimeType), 25000)
    if (!url) return { url: null, error: 'Upload failed or timed out' }

    const { error } = await admin.from('profiles').update({ avatar_url: url }).eq('id', userId)
    if (error) return { url: null, error: error.message }
    return { url, error: null }
  } catch (e: unknown) {
    return { url: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// Takes userId (not an already-known email) so both the cookie-session web caller and
// the bearer-token mobile caller can share this — mirrors the rest of lib/mobile/core's
// "core takes userId, resolves whatever else it needs itself" convention. Verification
// step (AdminInitiateAuthCommand) intentionally doesn't touch the caller's own session.
export async function changeMyPasswordCore(admin: AdminClient, userId: string, currentPassword: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
    if (!profile?.email) return { error: 'Not authenticated' }

    try {
      await cognitoClient.send(new AdminInitiateAuthCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        ClientId: COGNITO_WEB_CLIENT_ID,
        AuthFlow: AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
        AuthParameters: { USERNAME: profile.email, PASSWORD: currentPassword },
      }))
    } catch (e: unknown) {
      if (e instanceof NotAuthorizedException) return { error: 'Current password is incorrect.' }
      throw e
    }

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: profile.email,
      Password: newPassword,
      Permanent: true,
    }))

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
