'use server'

import { adminClient } from '@/lib/db/admin-client'

export async function toggleFormStatus(
  formId: string,
  currentStatus: string,
  jobType: string,
  forceSwap = false
): Promise<{ error: string | null; conflict?: { id: string; name: string } }> {
  const supabase = adminClient()

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
