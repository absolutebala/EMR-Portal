'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Server configuration error.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function saveForm(
  formId: string,
  payload: {
    name: string
    job_type: string
    status: 'draft' | 'active'
    field_count: number
  },
  forceSwap = false
): Promise<{ error: string | null; conflict?: { id: string; name: string } }> {
  try {
    const supabase = adminClient()

    if (payload.status === 'active') {
      const { data: existing } = await supabase
        .from('forms')
        .select('id, name')
        .eq('job_type', payload.job_type)
        .eq('status', 'active')
        .neq('id', formId)
        .maybeSingle()

      if (existing && !forceSwap) {
        return { error: null, conflict: { id: existing.id, name: existing.name } }
      }

      if (existing && forceSwap) {
        await supabase
          .from('forms')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    }

    const { error } = await supabase
      .from('forms')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', formId)

    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createForm(payload: {
  name: string
  job_type: string
  status: 'draft' | 'active'
  field_count: number
}): Promise<{ error: string | null; id?: string }> {
  try {
    const supabase = adminClient()
    const { data, error } = await supabase
      .from('forms')
      .insert(payload)
      .select('id')
      .single()
    return { error: error?.message || null, id: data?.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
