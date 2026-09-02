'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import type { Department } from '@/lib/departments'

export async function getDepartments(): Promise<{ departments: Department[]; error: string | null }> {
  try {
    // Explicit display order (sort_order), name as a stable tiebreaker.
    const { data, error } = await adminClient().from('departments').select('id, name').order('sort_order').order('name')
    if (error) return { departments: [], error: error.message }
    return { departments: data || [], error: null }
  } catch (e: unknown) {
    return { departments: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addDepartment(name: string): Promise<{ error: string | null }> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: 'Department name is required' }
    const admin = adminClient()
    // New departments append to the end of the list.
    const { data: last } = await admin.from('departments').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const nextOrder = (last?.sort_order ?? 0) + 1
    const { error } = await admin.from('departments').insert({ name: trimmed, sort_order: nextOrder })
    if (error) return { error: error.code === '23505' ? 'A department with that name already exists.' : error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateDepartment(id: string, name: string): Promise<{ error: string | null }> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: 'Department name is required' }
    const { error } = await adminClient().from('departments').update({ name: trimmed }).eq('id', id)
    if (error) return { error: error.code === '23505' ? 'A department with that name already exists.' : error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Deleting a department blanks the department on any notifications tagged with it
// (work_orders.department_id is ON DELETE SET NULL) and removes it from any Service
// Manager's assignments (profile_departments cascades) — the FKs handle the cleanup.
export async function deleteDepartment(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await adminClient().from('departments').delete().eq('id', id)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Persist a new display order: sort_order follows the given id sequence.
export async function reorderDepartments(orderedIds: string[]): Promise<{ error: string | null }> {
  try {
    const admin = adminClient()
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await admin.from('departments').update({ sort_order: i + 1 }).eq('id', orderedIds[i])
      if (error) return { error: error.message }
    }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Multi-department assignment (Service Manager and other non-Field-Engineer roles)
// — used to pre-populate the Add/Edit User form's checkboxes.
export async function getProfileDepartmentIds(profileId: string): Promise<{ departmentIds: string[]; error: string | null }> {
  try {
    const { data, error } = await adminClient().from('profile_departments').select('department_id').eq('profile_id', profileId)
    if (error) return { departmentIds: [], error: error.message }
    return { departmentIds: (data || []).map(r => r.department_id), error: null }
  } catch (e: unknown) {
    return { departmentIds: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Departments the current user's own notifications can be tagged with — their own
// assigned department(s) if they have any (the common case: a Service Manager
// assigned to one department, auto-selected on the creation form), or the full
// list as a fallback (Super Admin, Head of Service, or a Service Manager not yet
// configured) so notification creation is never blocked by missing department setup.
export async function getMyAssignableDepartments(): Promise<{ departments: Department[]; error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { departments: [], error: 'Not authenticated' }

    const admin = adminClient()
    // Filter the ordered full list by the user's assigned ids, so the assignable list
    // follows the same sort_order as everywhere else.
    const { departments: all, error: allError } = await getDepartments()
    if (allError) return { departments: [], error: allError }

    const { data: assigned, error: assignedError } = await admin
      .from('profile_departments')
      .select('department_id')
      .eq('profile_id', user.id)
    if (assignedError) return { departments: [], error: assignedError.message }

    const assignedIds = new Set((assigned || []).map(r => r.department_id))
    const mine = all.filter(d => assignedIds.has(d.id))
    return { departments: mine.length ? mine : all, error: null }
  } catch (e: unknown) {
    return { departments: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Department IDs the current user's own view of Dashboard/Work Orders/Expenses/
// Product Requests should be restricted to — null means "no restriction" (see
// every notification org-wide). Only Service Manager is scoped this way; every
// other role keeps seeing the whole org, same as approval routing already does.
// A Service Manager not yet assigned to any department also sees everything, so a
// misconfigured account doesn't silently render an empty app.
export async function getMyDepartmentScope(): Promise<string[] | null> {
  try {
    const user = await getAuthedUser()
    if (!user) return null

    const admin = adminClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'Service Manager') return null

    const { data: assigned } = await admin.from('profile_departments').select('department_id').eq('profile_id', user.id)
    const ids = (assigned || []).map(r => r.department_id)
    return ids.length ? ids : null
  } catch {
    return null
  }
}
