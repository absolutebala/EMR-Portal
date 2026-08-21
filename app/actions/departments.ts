'use server'

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
