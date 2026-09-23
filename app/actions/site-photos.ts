'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import { listSitePhotosCore, addSitePhotosCore, type SitePhoto } from '@/lib/mobile/core/sitePhotos'

export async function getSitePhotos(workOrderId: string): Promise<{ photos: SitePhoto[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { photos: [], error: 'Not authenticated' }
  return listSitePhotosCore(adminClient(), workOrderId)
}

export async function addSitePhotos(
  workOrderId: string,
  photos: { base64: string; mimeType: string; ext: string }[],
): Promise<{ added: number; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { added: 0, error: 'Not authenticated' }
  return addSitePhotosCore(adminClient(), user.id, workOrderId, photos)
}
