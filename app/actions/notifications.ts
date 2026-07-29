'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface NotificationView {
  id: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  read: boolean
  createdAt: string
}

export async function getMyNotifications(limit = 20): Promise<{ notifications: NotificationView[]; unreadCount: number; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { notifications: [], unreadCount: 0, error: 'Not authenticated' }

    const admin = adminClient()
    const [{ data: rows }, { count }] = await Promise.all([
      admin.from('notifications').select('id, type, title, body, link_path, read_at, created_at')
        .eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(limit),
      admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id).is('read_at', null),
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

export async function markNotificationRead(id: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id).eq('recipient_id', user.id)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id).is('read_at', null)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
