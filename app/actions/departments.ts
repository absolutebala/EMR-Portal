'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'
import type { Department } from '@/lib/departments'

export async function getDepartments(): Promise<{ departments: Department[]; error: string | null }> {
  try {
    const { data, error } = await adminClient().from('departments').select('id, name').order('name')
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
    const { error } = await adminClient().from('departments').insert({ name: trimmed })
    return { error: error?.message || null }
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
    const { data: assigned, error: assignedError } = await admin
      .from('profile_departments')
      .select('departments(id, name)')
      .eq('profile_id', user.id)
    if (assignedError) return { departments: [], error: assignedError.message }

    type Row = { departments: { id: string; name: string } | Array<{ id: string; name: string }> | null }
    const one = (v: Row['departments']): { id: string; name: string } | null => (Array.isArray(v) ? v[0] ?? null : v)
    const myDepartments = ((assigned as unknown as Row[]) || []).map(r => one(r.departments)).filter((d): d is Department => !!d)
    if (myDepartments.length) return { departments: myDepartments, error: null }

    return getDepartments()
  } catch (e: unknown) {
    return { departments: [], error: e instanceof Error ? e.message : String(e) }
  }
}
