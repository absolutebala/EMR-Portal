'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function updateUser(
  userId: string,
  fields: {
    first_name: string
    last_name: string
    employee_id: string
    phone: string | null
    role: string
    manager_id: string | null
  }
): Promise<{ error: string | null }> {
  try {
    const sSb = await serverClient()
    const { data: { user } } = await sSb.auth.getUser()
    if (!user) return { error: 'Not authenticated.' }

    const { data: currentProfile } = await sSb.from('profiles').select('role').eq('id', user.id).single()

    const admin = adminClient()

    if (currentProfile?.role === 'Service Manager') {
      const { data: target } = await admin.from('profiles').select('created_by').eq('id', userId).single()
      if (target?.created_by !== user.id) return { error: 'Permission denied. You can only edit users you created.' }
    }

    const { error } = await admin.from('profiles').update(fields).eq('id', userId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
