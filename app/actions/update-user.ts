'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { adminClient } from '@/lib/db/admin-client'

export async function updateUser(
  userId: string,
  fields: {
    first_name: string
    last_name: string
    employee_id: string
    phone: string | null
    role: string
    manager_id: string | null
    is_active: boolean
    grade: string | null
    department_id: string | null
    // Multi-department assignment (Service Manager and other non-Field-Engineer
    // roles) — not a profiles column, replaces this user's profile_departments rows.
    department_ids: string[]
  }
): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated.' }

    const admin = adminClient()

    const { data: currentProfile } = await admin.from('profiles').select('role, first_name, last_name').eq('id', user.id).single()

    if (currentProfile?.role === 'Service Manager') {
      const { data: target } = await admin.from('profiles').select('created_by, role').eq('id', userId).single()
      // Service Managers may edit any Field Engineer; for other roles they're limited to
      // accounts they created themselves.
      if (target?.role !== 'Field Engineer' && target?.created_by !== user.id) {
        return { error: 'Permission denied. You can only edit field engineers or users you created.' }
      }
    }

    const { department_ids, ...profileFields } = fields
    // Employee ID is optional — a blank one is stored as NULL so ID-less users don't
    // collide on the UNIQUE constraint (Postgres treats NULLs as distinct).
    const { error } = await admin.from('profiles')
      .update({ ...profileFields, employee_id: profileFields.employee_id.trim() || null })
      .eq('id', userId)
    if (error) return { error: error.message }

    await admin.from('profile_departments').delete().eq('profile_id', userId)
    if (department_ids.length) {
      await admin.from('profile_departments').insert(department_ids.map(department_id => ({ profile_id: userId, department_id })))
    }

    const actorName = currentProfile ? `${currentProfile.first_name} ${currentProfile.last_name}` : 'Admin'
    const targetKind = fields.role === 'Field Engineer' ? 'field engineer' : 'user'
    await logActivity(admin, { actorId: user.id, actorName, action: `Updated ${targetKind} ${fields.first_name} ${fields.last_name}`, entityType: 'user', entityId: userId })

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
