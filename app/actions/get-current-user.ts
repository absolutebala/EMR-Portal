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
