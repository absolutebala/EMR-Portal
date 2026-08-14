'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'
import { adminClient } from '@/lib/db/admin-client'

// Still Supabase, not RDS/PostgREST — this file's .auth.admin.deleteUser() call is
// Phase F territory (Cognito's AdminDeleteUserCommand), deferred along with the rest
// of this file's DB reads/writes so the auth-admin and profile-row deletes stay
// atomic-ish (same client) until that rewrite happens.
function supabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function deleteUser(targetUserId: string): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated.' }
    if (user.id === targetUserId) return { error: 'You cannot delete your own account.' }

    const admin = supabaseAdminClient()
    const { data: currentProfile } = await adminClient().from('profiles').select('role, first_name, last_name').eq('id', user.id).single()

    if (currentProfile?.role === 'Service Manager') {
      const { data: target } = await admin.from('profiles').select('created_by').eq('id', targetUserId).single()
      if (target?.created_by !== user.id) return { error: 'Permission denied. You can only delete users you created.' }
    }

    const { data: target } = await admin.from('profiles').select('first_name, last_name').eq('id', targetUserId).maybeSingle()

    // Deleting the auth user cascades to the profile row
    const { error } = await admin.auth.admin.deleteUser(targetUserId)
    if (!error) {
      const actorName = currentProfile ? `${currentProfile.first_name} ${currentProfile.last_name}` : 'Admin'
      const targetName = target ? `${target.first_name} ${target.last_name}` : targetUserId
      await logActivity(adminClient(), { actorId: user.id, actorName, action: `Deleted user ${targetName}`, entityType: 'user', entityId: targetUserId })
    }
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
