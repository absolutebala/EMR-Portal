'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface RoleWithCount {
  name: string
  is_system: boolean
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
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteRole(name: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('roles').delete().eq('name', name)
    if (error) {
      if (error.code === '23503') {
        return { error: `Cannot delete "${name}" — users are still assigned to this role. Reassign them first.` }
      }
      return { error: error.message }
    }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
