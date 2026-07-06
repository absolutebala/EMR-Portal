'use server'

import { createClient } from '@supabase/supabase-js'

export async function saveForm(
  formId: string,
  payload: {
    name: string
    job_type: string
    status: 'draft' | 'active'
    field_count: number
  }
): Promise<{ error: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration error.' }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await supabase
    .from('forms')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', formId)

  return { error: error?.message || null }
}

export async function createForm(payload: {
  name: string
  job_type: string
  status: 'draft' | 'active'
  field_count: number
}): Promise<{ error: string | null; id?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration error.' }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('forms')
    .insert(payload)
    .select('id')
    .single()

  return { error: error?.message || null, id: data?.id }
}
