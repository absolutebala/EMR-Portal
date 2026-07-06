'use server'

import { createClient } from '@supabase/supabase-js'

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
    const sb = adminClient()
    const { error } = await sb
      .from('profiles')
      .update(fields)
      .eq('id', userId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
