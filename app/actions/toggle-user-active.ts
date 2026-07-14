'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function toggleUserActive(
  targetUserId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated.' }

    const { data: profile } = await sb
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single()

    const admin = adminClient()

    if (profile?.role === 'Service Manager') {
      const { data: target } = await admin
        .from('profiles')
        .select('created_by')
        .eq('id', targetUserId)
        .single()
      if (target?.created_by !== user.id) {
        return { error: 'Permission denied. You can only manage users you created.' }
      }
    }

    const { error } = await admin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', targetUserId)
    if (!error) {
      const { data: target } = await admin.from('profiles').select('first_name, last_name').eq('id', targetUserId).maybeSingle()
      const actorName = profile ? `${profile.first_name} ${profile.last_name}` : 'Admin'
      const targetName = target ? `${target.first_name} ${target.last_name}` : targetUserId
      await logActivity(admin, { actorId: user.id, actorName, action: `${isActive ? 'Activated' : 'Deactivated'} user ${targetName}`, entityType: 'user', entityId: targetUserId })
    }
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
