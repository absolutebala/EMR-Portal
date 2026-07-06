'use server'

import { createClient } from '@supabase/supabase-js'

export async function toggleFormStatus(
  formId: string,
  currentStatus: string,
  jobType: string,
  forceSwap = false
): Promise<{ error: string | null; conflict?: { id: string; name: string } }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration error.' }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const newStatus = currentStatus === 'active' ? 'draft' : 'active'

  if (newStatus === 'active') {
    const { data: existing } = await supabase
      .from('forms')
      .select('id, name')
      .eq('job_type', jobType)
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
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', formId)

  return { error: error?.message || null }
}
