import { uploadAsset } from '@/lib/storage/s3'
import { type AdminClient, withTimeout } from './shared'

// Free-form "site photos" a field engineer attaches to a notification from the mobile
// app — separate from job-form photo fields. Many per notification, added across visits,
// shown on mobile + web. Stored in S3 under site-photos/<workOrderId>/.

export interface SitePhoto {
  id: string
  url: string
  uploadedBy: string | null
  uploaderName: string | null
  createdAt: string
}

export async function listSitePhotosCore(admin: AdminClient, workOrderId: string): Promise<{ photos: SitePhoto[]; error: string | null }> {
  try {
    const { data, error } = await admin
      .from('site_photos')
      .select('id, url, uploaded_by, created_at')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: false })
    if (error) return { photos: [], error: error.message }
    const rows = (data ?? []) as { id: string; url: string; uploaded_by: string | null; created_at: string }[]

    const uploaderIds = [...new Set(rows.map(r => r.uploaded_by).filter(Boolean))] as string[]
    const nameMap: Record<string, string> = {}
    if (uploaderIds.length) {
      const { data: people } = await admin.from('profiles').select('id, first_name, last_name').in('id', uploaderIds)
      for (const p of (people ?? []) as { id: string; first_name: string; last_name: string }[]) {
        nameMap[p.id] = `${p.first_name} ${p.last_name}`.trim()
      }
    }

    return {
      photos: rows.map(r => ({
        id: r.id,
        url: r.url,
        uploadedBy: r.uploaded_by,
        uploaderName: r.uploaded_by ? (nameMap[r.uploaded_by] ?? null) : null,
        createdAt: r.created_at,
      })),
      error: null,
    }
  } catch (e: unknown) {
    return { photos: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addSitePhotosCore(
  admin: AdminClient,
  userId: string,
  workOrderId: string,
  photos: { base64: string; mimeType: string; ext: string }[],
): Promise<{ added: number; error: string | null }> {
  try {
    if (!photos.length) return { added: 0, error: 'No photos provided' }

    // Confirm the notification exists before uploading anything to S3.
    const { data: wo } = await admin.from('work_orders').select('id').eq('id', workOrderId).maybeSingle()
    if (!wo) return { added: 0, error: 'Notification not found' }

    const rows: { work_order_id: string; uploaded_by: string; url: string }[] = []
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]
      const base64 = p.base64.split(',')[1] ?? p.base64
      const buffer = Buffer.from(base64, 'base64')
      const key = `site-photos/${workOrderId}/${userId}-${Date.now()}-${i}.${p.ext || 'jpg'}`
      const url = await withTimeout(uploadAsset(key, buffer, p.mimeType || 'image/jpeg'), 25000)
      if (url) rows.push({ work_order_id: workOrderId, uploaded_by: userId, url })
    }

    if (!rows.length) return { added: 0, error: 'Upload failed or timed out' }
    const { error } = await admin.from('site_photos').insert(rows)
    if (error) return { added: 0, error: error.message }
    return { added: rows.length, error: null }
  } catch (e: unknown) {
    return { added: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// Roles allowed to delete any site photo (in addition to the photo's own uploader).
const PHOTO_DELETE_ADMIN_ROLES = ['Super Admin', 'Head of Service', 'Service Manager']

export async function deleteSitePhotoCore(admin: AdminClient, userId: string, photoId: string): Promise<{ error: string | null }> {
  try {
    const { data: photo } = await admin.from('site_photos').select('uploaded_by, work_order_id').eq('id', photoId).maybeSingle()
    if (!photo) return { error: 'Photo not found' }

    // Permission: the uploader may delete their own photo; admin roles may delete any.
    // The S3 object itself is left in place — there's no delete helper in lib/storage/s3.ts,
    // and orphaned objects behind CloudFront are harmless once the DB row is gone.
    let allowed = photo.uploaded_by === userId
    if (!allowed) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
      allowed = !!profile && PHOTO_DELETE_ADMIN_ROLES.includes(profile.role)
    }
    if (!allowed) return { error: 'You do not have permission to delete this photo' }

    const { error } = await admin.from('site_photos').delete().eq('id', photoId)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
