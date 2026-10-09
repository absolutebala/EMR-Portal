'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

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
  role?: string
  page?: number
}): Promise<{ activities: ActivityLogRow[]; total: number; error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { activities: [], total: 0, error: 'Not authenticated.' }

    const admin = adminClient()
    const page = filters.page && filters.page > 0 ? filters.page : 1
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    // "User group" filter: activity_log stores only actor_id/actor_name, so resolve the
    // ids of the profiles in the chosen role and constrain the feed to those actors.
    let roleActorIds: string[] | null = null
    if (filters.role) {
      const { data: roleProfiles } = await admin.from('profiles').select('id').eq('role', filters.role)
      roleActorIds = (roleProfiles || []).map(p => p.id)
      if (roleActorIds.length === 0) return { activities: [], total: 0, error: null }
    }

    let query = admin.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filters.actorId) query = query.eq('actor_id', filters.actorId)
    if (filters.entityType) query = query.eq('entity_type', filters.entityType)
    if (roleActorIds) query = query.in('actor_id', roleActorIds)

    const { data, error, count } = await query.range(from, to)
    if (error) return { activities: [], total: 0, error: error.message }

    return { activities: (data as ActivityLogRow[]) || [], total: count ?? 0, error: null }
  } catch (e: unknown) {
    return { activities: [], total: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getActivityRoles(): Promise<{ roles: string[]; error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { roles: [], error: 'Not authenticated.' }

    const admin = adminClient()
    // Only roles that actually have members — an empty group isn't a useful filter.
    const { data, error } = await admin.from('profiles').select('role')
    if (error) return { roles: [], error: error.message }
    const roles = Array.from(new Set((data || []).map(p => p.role).filter((r): r is string => !!r))).sort()
    return { roles, error: null }
  } catch (e: unknown) {
    return { roles: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getActivityActors(): Promise<{ actors: ActivityActor[]; error: string | null }> {
  try {
    const user = await getAuthedUser()
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
