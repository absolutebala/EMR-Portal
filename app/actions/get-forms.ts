'use server'

import { adminClient } from '@/lib/db/admin-client'

export async function getForms() {
  const admin = adminClient()
  const { data, error } = await admin
    .from('forms')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data, error: null }
}
