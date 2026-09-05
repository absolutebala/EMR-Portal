'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getAuthedUser } from '@/lib/cognito/server'
import { sendExpoPushToUser } from '@/lib/push'

// Roles allowed to trigger an app-update prompt (same as who manages Settings).
const ADMIN_ROLES = ['Super Admin', 'Head of Service']

// Records the update prompt (message + timestamp) on the settings row and pushes a
// notification to every Field Engineer's device. The mobile app reads the message +
// play_store_url from the dashboard payload and shows an in-app popup with an
// "Update now" button; the push is the tray alert that nudges them to open the app.
export async function sendAppUpdatePrompt(message: string): Promise<{ error: string | null; sent?: number }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }
    const admin = adminClient()

    const { data: actor } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!actor || !ADMIN_ROLES.includes(actor.role as string)) {
      return { error: 'You are not allowed to send an update prompt.' }
    }

    const trimmed = message.trim()
    if (!trimmed) return { error: 'Enter a message for the update prompt.' }

    const { data: settings } = await admin.from('settings').select('id, play_store_url').limit(1).maybeSingle()
    if (!settings) return { error: 'Settings not found.' }

    const promptAt = new Date().toISOString()
    const { error: upErr } = await admin.from('settings')
      .update({ update_prompt_message: trimmed, update_prompt_at: promptAt, updated_at: promptAt })
      .eq('id', settings.id)
    if (upErr) return { error: upErr.message }

    // Push only to the native-app audience (Field Engineers). Tapping opens the Play
    // Store link if set, else the app's dashboard.
    const { data: engineers } = await admin.from('profiles').select('id').eq('role', 'Field Engineer')
    const url = settings.play_store_url || undefined
    let sent = 0
    await Promise.all((engineers || []).map(async e => {
      try {
        await sendExpoPushToUser(admin, e.id as string, { title: 'Update available', body: trimmed, url })
        sent++
      } catch { /* best-effort per device */ }
    }))

    return { error: null, sent }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
