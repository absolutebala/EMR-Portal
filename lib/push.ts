import webpush from 'web-push'
import { Expo, type ExpoPushMessage } from 'expo-server-sdk'
import type { adminClient } from '@/lib/db/admin-client'

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

const expo = new Expo()

// RN-side counterpart to sendPushToUser() below — additive, not a replacement for
// Web Push (which the PWA keeps using). No env-var gate needed: Expo's push service
// doesn't require any server-side credentials for a managed (non-FCM/APNs-direct)
// Expo app, so this is always "configured".
export async function sendExpoPushToUser(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  payload: { title: string; body?: string | null; url?: string | null }
): Promise<void> {
  try {
    const { data: tokens } = await admin.from('expo_push_tokens').select('id, expo_push_token').eq('user_id', userId)
    if (!tokens?.length) return

    const messages: ExpoPushMessage[] = []
    const staleIds: string[] = []
    for (const t of tokens) {
      if (!Expo.isExpoPushToken(t.expo_push_token)) {
        staleIds.push(t.id)
        continue
      }
      messages.push({
        to: t.expo_push_token,
        title: payload.title,
        body: payload.body || '',
        data: { url: payload.url || '/(app)/alerts' },
      })
    }
    if (staleIds.length) await admin.from('expo_push_tokens').delete().in('id', staleIds)
    if (!messages.length) return

    const chunks = expo.chunkPushNotifications(messages)
    const invalidTokens: string[] = []
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk)
      receipts.forEach((r, i) => {
        // DeviceNotRegistered means the OS/Expo has invalidated this token (e.g. the
        // app was uninstalled) — same cleanup principle as the 404/410 handling below
        // for Web Push subscriptions, so a dead token doesn't get retried forever.
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(chunk[i].to as string)
        }
      })
    }
    if (invalidTokens.length) {
      await admin.from('expo_push_tokens').delete().in('expo_push_token', invalidTokens)
    }
  } catch {
    // best-effort only
  }
}

// Fire-and-forget OS-level push, alongside the in-app notification row —
// silently a no-op if VAPID env vars aren't set, so this is safe to call
// unconditionally from notifyUsers() without gating every call site.
export async function sendPushToUser(
  admin: ReturnType<typeof adminClient>,
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
