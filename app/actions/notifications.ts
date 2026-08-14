'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/mobile/core/shared'
import {
  getMyNotificationsCore, markNotificationReadCore, markAllNotificationsReadCore,
  type NotificationView,
} from '@/lib/mobile/core/notifications'
// NOTE: NotificationView now lives in lib/mobile/core/notifications.ts — import it
// from there directly, not from this file (same 'use server' type re-export
// constraint as elsewhere in this codebase).

export async function getMyNotifications(limit = 20): Promise<{ notifications: NotificationView[]; unreadCount: number; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { notifications: [], unreadCount: 0, error: 'Not authenticated' }
  return getMyNotificationsCore(adminClient(), user.id, limit)
}

export async function markNotificationRead(id: string): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return markNotificationReadCore(adminClient(), user.id, id)
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return markAllNotificationsReadCore(adminClient(), user.id)
}
