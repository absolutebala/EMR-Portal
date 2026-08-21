'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { getMyProfileCore, updateMyProfileCore, uploadMyAvatarCore, changeMyPasswordCore, type MyProfile } from '@/lib/mobile/core/profile'

export async function getMyProfile(): Promise<{ profile: MyProfile | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { profile: null, error: 'Not authenticated' }
  return getMyProfileCore(adminClient(), user.id)
}

export async function uploadMyAvatar(photo: { base64: string; mimeType: string; ext: string }): Promise<{ url: string | null; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { url: null, error: 'Not authenticated' }
  return uploadMyAvatarCore(adminClient(), user.id, photo)
}

export async function updateMyProfile(updates: {
  first_name: string
  last_name: string
  phone: string | null
}): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return updateMyProfileCore(adminClient(), user.id, { firstName: updates.first_name, lastName: updates.last_name, phone: updates.phone })
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return changeMyPasswordCore(adminClient(), user.id, currentPassword, newPassword)
}
