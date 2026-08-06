import type { SupabaseClient } from '@supabase/supabase-js'

type NotifyTarget = { userId: string } | { role: 'Super Admin' | 'Head of Service' | 'Service Manager' }

// Fire-and-forget per-user alert feed, alongside logActivity's system-wide feed.
// Never throws — a notification failure must not break the calling action.
export async function notifyUsers(
  admin: SupabaseClient,
  targets: NotifyTarget[],
  params: {
    type: string
    title: string
    body?: string | null
    entityType?: string | null
    entityId?: string | null
    linkPath?: string | null
  }
): Promise<void> {
  try {
    const recipientIds = new Set<string>()
    for (const target of targets) {
      if ('userId' in target) {
        recipientIds.add(target.userId)
      } else {
        const { data } = await admin.from('profiles').select('id').eq('role', target.role)
        for (const p of data || []) recipientIds.add(p.id)
      }
    }
    if (recipientIds.size === 0) return
    await admin.from('notifications').insert(
      Array.from(recipientIds).map(recipientId => ({
        recipient_id: recipientId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        link_path: params.linkPath ?? null,
      }))
    )
  } catch {
    // best-effort only
  }
}
