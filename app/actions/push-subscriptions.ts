'use server'

import { adminClient } from '@/lib/db/admin-client'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'

export async function savePushSubscription(sub: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    // Upsert by endpoint — re-subscribing (e.g. after clearing site data on the
    // same device) should update the row, not create a duplicate the old cleanup
    // logic in lib/push.ts would never touch.
    const { error } = await admin.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    }, { onConflict: 'endpoint' })
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deletePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    await admin.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
