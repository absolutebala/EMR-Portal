'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface ActivityLogRow {
  id: string
  actor_id: string | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
}

export interface ActivityActor {
  id: string
  name: string
}

const PAGE_SIZE = 50

export async function getActivities(filters: {
  actorId?: string
  entityType?: string
  page?: number
}): Promise<{ activities: ActivityLogRow[]; total: number; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { activities: [], total: 0, error: 'Not authenticated.' }

    const admin = adminClient()
    const page = filters.page && filters.page > 0 ? filters.page : 1
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = admin.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filters.actorId) query = query.eq('actor_id', filters.actorId)
    if (filters.entityType) query = query.eq('entity_type', filters.entityType)

    const { data, error, count } = await query.range(from, to)
    if (error) return { activities: [], total: 0, error: error.message }

    return { activities: (data as ActivityLogRow[]) || [], total: count ?? 0, error: null }
  } catch (e: unknown) {
    return { activities: [], total: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getActivityActors(): Promise<{ actors: ActivityActor[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { actors: [], error: 'Not authenticated.' }

    const admin = adminClient()
    const { data, error } = await admin.from('profiles').select('id, first_name, last_name').order('first_name', { ascending: true })
    if (error) return { actors: [], error: error.message }

    return {
      actors: (data || []).map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` })),
      error: null,
    }
  } catch (e: unknown) {
    return { actors: [], error: e instanceof Error ? e.message : String(e) }
  }
}
