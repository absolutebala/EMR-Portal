import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let configured = false
function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@emrglobal.com', publicKey, privateKey)
    configured = true
  }
  return true
}

// Fire-and-forget OS-level push, alongside the in-app notification row —
// silently a no-op if VAPID env vars aren't set, so this is safe to call
// unconditionally from notifyUsers() without gating every call site.
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: { title: string; body?: string | null; url?: string | null }
): Promise<void> {
  if (!ensureConfigured()) return
  try {
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body || '', url: payload.url || '/mobile/alerts' })
        )
      } catch (e: unknown) {
        // 404/410 means the browser/OS has invalidated this subscription (e.g. the
        // user uninstalled the PWA or cleared site data) — stop retrying it forever.
        const statusCode = (e as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }
  } catch {
    // best-effort only
  }
}
