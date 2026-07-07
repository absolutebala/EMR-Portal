'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function saveAssessment(payload: {
  id?: string
  customer_id: string | null
  transformer_id: string | null
  status: 'draft' | 'submitted'
  form_data: Record<string, unknown>
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { id: null, error: 'Not authenticated.' }

    const admin = adminClient()

    if (payload.id) {
      const { error } = await admin.from('nifps_assessments')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
      return { id: payload.id, error: error?.message || null }
    }

    const { data, error } = await admin.from('nifps_assessments')
      .insert({ ...payload, created_by: user.id })
      .select('id').single()
    return { id: data?.id || null, error: error?.message || null }
  } catch (e: unknown) {
    return { id: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAssessments(): Promise<{ data: unknown[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin
      .from('nifps_assessments')
      .select('id, status, created_at, updated_at, customer_id, form_data, created_by')
      .order('updated_at', { ascending: false })
    return { data: data || [], error: error?.message || null }
  } catch (e: unknown) {
    return { data: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAssessment(id: string): Promise<{ data: unknown | null; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin.from('nifps_assessments').select('*').eq('id', id).single()
    return { data, error: error?.message || null }
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) }
  }
}
