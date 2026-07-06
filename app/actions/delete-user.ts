'use server'

import { createClient as serverClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function deleteUser(targetUserId: string): Promise<{ error: string | null }> {
  try {
    const sSb = await serverClient()
    const { data: { user } } = await sSb.auth.getUser()
    if (!user) return { error: 'Not authenticated.' }
    if (user.id === targetUserId) return { error: 'You cannot delete your own account.' }

    const { data: currentProfile } = await sSb.from('profiles').select('role').eq('id', user.id).single()
    const admin = adminClient()

    if (currentProfile?.role === 'Service Manager') {
      const { data: target } = await admin.from('profiles').select('created_by').eq('id', targetUserId).single()
      if (target?.created_by !== user.id) return { error: 'Permission denied. You can only delete users you created.' }
    }

    // Deleting the auth user cascades to the profile row
    const { error } = await admin.auth.admin.deleteUser(targetUserId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
