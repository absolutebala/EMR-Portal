'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function getForms() {
  const admin = adminClient()
  const { data, error } = await admin
    .from('forms')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}
