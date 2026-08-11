import type { AdminClient } from './shared'

export interface NotificationView {
  id: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  read: boolean
  createdAt: string
}

export async function getMyNotificationsCore(admin: AdminClient, userId: string, limit = 20): Promise<{ notifications: NotificationView[]; unreadCount: number; error: string | null }> {
  try {
    const [{ data: rows }, { count }] = await Promise.all([
      admin.from('notifications').select('id, type, title, body, link_path, read_at, created_at')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(limit),
      admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId).is('read_at', null),
    ])

    const notifications: NotificationView[] = (rows || []).map(r => ({
      id: r.id, type: r.type, title: r.title, body: r.body, linkPath: r.link_path,
      read: !!r.read_at, createdAt: r.created_at,
    }))
    return { notifications, unreadCount: count || 0, error: null }
  } catch (e: unknown) {
    return { notifications: [], unreadCount: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function markNotificationReadCore(admin: AdminClient, userId: string, id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await admin.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id).eq('recipient_id', userId)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function markAllNotificationsReadCore(admin: AdminClient, userId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await admin.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId).is('read_at', null)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// RN-only — the PWA registers a Web Push subscription instead (app/actions/push-subscriptions.ts).
// Upsert by expo_push_token (unique) so re-registering the same device (e.g. after a
// reinstall generates the same token, or just re-running the registration effect on
// every app open) updates the row instead of erroring on the unique constraint.
export async function registerExpoPushTokenCore(admin: AdminClient, userId: string, params: {
  token: string
  platform: string | null
  deviceName: string | null
}): Promise<{ error: string | null }> {
  try {
    const { error } = await admin.from('expo_push_tokens').upsert({
      user_id: userId,
      expo_push_token: params.token,
      platform: params.platform,
      device_name: params.deviceName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'expo_push_token' })
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
