'use server'

import { createClient } from '@supabase/supabase-js'

export async function toggleFormStatus(
  formId: string,
  currentStatus: string
): Promise<{ error: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration error.' }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const newStatus = currentStatus === 'active' ? 'draft' : 'active'
  const { error } = await supabase
    .from('forms')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', formId)

  return { error: error?.message || null }
}
