'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function assignForm(
  formId: string,
  newJobType: string,
  forceSwap = false
): Promise<{ error: string | null; conflict?: { id: string; name: string } }> {
  try {
    const sb = adminClient()

    // Check if another ACTIVE form already uses this job type
    const { data: existing } = await sb
      .from('forms')
      .select('id, name')
      .eq('job_type', newJobType)
      .eq('status', 'active')
      .neq('id', formId)
      .maybeSingle()

    if (existing && !forceSwap) {
      return { error: null, conflict: { id: existing.id, name: existing.name } }
    }

    if (existing && forceSwap) {
      await sb
        .from('forms')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }

    const { error } = await sb
      .from('forms')
      .update({ job_type: newJobType, updated_at: new Date().toISOString() })
      .eq('id', formId)

    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteForm(formId: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('forms').delete().eq('id', formId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
