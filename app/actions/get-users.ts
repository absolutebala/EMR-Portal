'use server'

import { createClient as serverClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function getUsers(): Promise<{ users: unknown[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { users: [], error: 'Not authenticated.' }

    const { data: profile } = await sb
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const admin = adminClient()

    if (profile?.role === 'Service Manager') {
      const { data, error } = await admin
        .from('profiles')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      return { users: data || [], error: error?.message || null }
    }

    // Super Admin and all other privileged roles see everyone
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    return { users: data || [], error: error?.message || null }
  } catch (e: unknown) {
    return { users: [], error: e instanceof Error ? e.message : String(e) }
  }
}
