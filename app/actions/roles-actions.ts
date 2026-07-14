'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient, getAuthedUser } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function currentActor(admin: ReturnType<typeof adminClient>): Promise<{ id: string | null; name: string }> {
  const sb = await createServerClient()
  const user = await getAuthedUser(sb)
  if (!user) return { id: null, name: 'Admin' }
  const { data: profile } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
  return { id: user.id, name: profile ? `${profile.first_name} ${profile.last_name}` : 'Admin' }
}

export interface RoleWithCount {
  name: string
  is_system: boolean
  requires_manager: boolean
  created_at: string
  user_count: number
}

export interface RoleWithPermissions {
  name: string
  is_system: boolean
  permissions: Record<string, boolean>
}

export async function getRoles(): Promise<{ roles: RoleWithCount[]; error: string | null }> {
  try {
    const sb = adminClient()
    const [{ data: roles, error }, { data: profiles }] = await Promise.all([
      sb.from('roles').select('*').order('created_at', { ascending: true }),
      sb.from('profiles').select('role'),
    ])
    if (error) return { roles: [], error: error.message }
    const counts: Record<string, number> = {}
    for (const p of profiles || []) counts[p.role] = (counts[p.role] || 0) + 1
    return {
      roles: (roles || []).map(r => ({ ...r, user_count: counts[r.name] || 0 })),
      error: null,
    }
  } catch (e: unknown) {
    return { roles: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addRole(name: string): Promise<{ error: string | null }> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: 'Role name cannot be empty.' }
    const sb = adminClient()
    const { error } = await sb.from('roles').insert({ name: trimmed, is_system: false })
    if (error) {
      if (error.code === '23505') return { error: `Role "${trimmed}" already exists.` }
      return { error: error.message }
    }
    const actor = await currentActor(sb)
    await logActivity(sb, { actorId: actor.id, actorName: actor.name, action: `Created role ${trimmed}`, entityType: 'role' })
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function renameRole(
  oldName: string,
  newName: string
): Promise<{ error: string | null }> {
  try {
    const trimmed = newName.trim()
    if (!trimmed) return { error: 'Role name cannot be empty.' }
    if (trimmed === oldName) return { error: null }
    const sb = adminClient()
    const { error } = await sb.from('roles').update({ name: trimmed }).eq('name', oldName)
    if (error) {
      if (error.code === '23505') return { error: `Role "${trimmed}" already exists.` }
      return { error: error.message }
    }
    const actor = await currentActor(sb)
    await logActivity(sb, { actorId: actor.id, actorName: actor.name, action: `Renamed role ${oldName} to ${trimmed}`, entityType: 'role' })
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getRolesWithPermissions(): Promise<{ roles: RoleWithPermissions[]; error: string | null }> {
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('roles')
      .select('name, is_system, permissions')
      .order('created_at', { ascending: true })
    if (error) return { roles: [], error: error.message }
    return {
      roles: (data || []).map(r => ({
        name: r.name,
        is_system: r.is_system,
        permissions: (r.permissions as Record<string, boolean>) || {},
      })),
      error: null,
    }
  } catch (e: unknown) {
    return { roles: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateRolePermissions(
  roleName: string,
  permissions: Record<string, boolean>
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb
      .from('roles')
      .update({ permissions })
      .eq('name', roleName)
    if (!error) {
      const actor = await currentActor(sb)
      await logActivity(sb, { actorId: actor.id, actorName: actor.name, action: `Updated permissions for role ${roleName}`, entityType: 'role' })
    }
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateRoleRequiresManager(
  name: string,
  requires_manager: boolean
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('roles').update({ requires_manager }).eq('name', name)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMyPermissions(): Promise<{ permissions: Record<string, boolean>; role: string; error: string | null }> {
  try {
    const sb = await createServerClient()
    const user = await getAuthedUser(sb)
    if (!user) return { permissions: {}, role: '', error: null }
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
    const role = (profile?.role as string) || ''
    if (!role) return { permissions: {}, role: '', error: null }
    const admin = adminClient()
    const { data: roleData, error } = await admin.from('roles').select('permissions').eq('name', role).maybeSingle()
    if (error) return { permissions: {}, role, error: error.message }
    return { permissions: (roleData?.permissions as Record<string, boolean>) ?? {}, role, error: null }
  } catch (e: unknown) {
    return { permissions: {}, role: '', error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteRole(name: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const actor = await currentActor(sb)
    const { error } = await sb.from('roles').delete().eq('name', name)
    if (error) {
      if (error.code === '23503') {
        return { error: `Cannot delete "${name}" — users are still assigned to this role. Reassign them first.` }
      }
      return { error: error.message }
    }
    await logActivity(sb, { actorId: actor.id, actorName: actor.name, action: `Deleted role ${name}`, entityType: 'role' })
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
