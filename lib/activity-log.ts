import type { SupabaseClient } from '@supabase/supabase-js'

// Fire-and-forget system activity log, separate from the per-work-order
// work_order_activity feed. Never throws — a logging failure must not break
// the calling action.
export async function logActivity(
  admin: SupabaseClient,
  params: {
    actorId: string | null
    actorName: string
    action: string
    entityType: string
    entityId?: string | null
  }
): Promise<void> {
  try {
    await admin.from('activity_log').insert({
      actor_id: params.actorId,
      actor_name: params.actorName,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
    })
  } catch {
    // best-effort only
  }
}
