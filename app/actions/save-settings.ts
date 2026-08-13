'use server'

import { adminClient } from '@/lib/db/admin-client'
import { storageAdminClient } from '@/lib/supabase/storage-admin'

export async function saveSettings(
  settingsId: string,
  fields: Record<string, string | null>
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb
      .from('settings')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', settingsId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function uploadLogo(
  settingsId: string,
  base64Data: string,
  mimeType: string,
  ext: string
): Promise<{ error: string | null; url?: string }> {
  try {
    const sb = adminClient()

    // Convert base64 to Buffer for upload
    const base64 = base64Data.split(',')[1] ?? base64Data
    const buffer = Buffer.from(base64, 'base64')
    const path = `logos/logo.${ext}`

    const { error: upErr } = await storageAdminClient().storage
      .from('assets')
      .upload(path, buffer, { upsert: true, contentType: mimeType })

    if (upErr) {
      // Fallback: store data URL directly in the settings row
      await sb
        .from('settings')
        .update({ logo_url: base64Data, updated_at: new Date().toISOString() })
        .eq('id', settingsId)
      return { error: null, url: base64Data }
    }

    const { data: { publicUrl } } = storageAdminClient().storage.from('assets').getPublicUrl(path)
    await sb
      .from('settings')
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', settingsId)
    return { error: null, url: publicUrl }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
