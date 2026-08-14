'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

export interface CurrentUserSummary {
  name: string
  role: string
}

// PostgREST is VPC-internal only (Phase D0), so client components can no longer query
// `profiles` directly the way WorkOrderDetailPageClient.tsx used to — this fills that
// one gap with a small server action instead.
export async function getCurrentUserSummary(): Promise<CurrentUserSummary | null> {
  const user = await getAuthedUser()
  if (!user) return null
  const { data } = await adminClient().from('profiles').select('first_name,last_name,role').eq('id', user.id).single()
  if (!data) return null
  return { name: `${data.first_name} ${data.last_name}`, role: data.role }
}

export interface CurrentUserProfile {
  first_name: string
  last_name: string
  phone: string
  email: string
  employee_id: string
}

// Same "PostgREST is VPC-internal only" gap as getCurrentUserSummary above — fills it
// for EditProfileModal.tsx, which used to query profiles directly with the browser
// Supabase client.
export async function getMyProfile(): Promise<CurrentUserProfile | null> {
  const user = await getAuthedUser()
  if (!user) return null
  const { data } = await adminClient().from('profiles').select('first_name,last_name,phone,employee_id').eq('id', user.id).single()
  if (!data) return null
  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    phone: data.phone || '',
    employee_id: data.employee_id || '',
    email: user.email,
  }
}
