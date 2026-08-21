import type { AdminClient } from './shared'

// Field Engineers no longer report to one fixed Service Manager — any Service
// Manager can be handed any Field Engineer's job, so approval routing is scoped by
// department instead: whoever is assigned (via profile_departments) to the
// submitting engineer's department AND whose role currently carries the given
// permission. Resolved by permission, not a hardcoded role name, so it stays
// correct for any future custom role — roles/permissions are already fully
// admin-configurable (see roles.permissions JSONB, RolesModal.tsx).
export async function getDepartmentApproverIdsCore(admin: AdminClient, departmentId: string | null, permissionKey: string): Promise<string[]> {
  if (!departmentId) return []
  try {
    const { data: assignments } = await admin
      .from('profile_departments')
      .select('profile_id, profiles(role)')
      .eq('department_id', departmentId)

    type Row = { profile_id: string; profiles: { role: string } | null }
    const rows = (assignments as unknown as Row[]) || []
    if (!rows.length) return []

    const roleNames = [...new Set(rows.map(r => r.profiles?.role).filter((r): r is string => !!r))]
    if (!roleNames.length) return []

    const { data: roleRows } = await admin.from('roles').select('name, permissions').in('name', roleNames)
    const allowedRoles = new Set(
      (roleRows || [])
        .filter(r => (r.permissions as Record<string, boolean> | null)?.[permissionKey] === true)
        .map(r => r.name)
    )

    return rows.filter(r => r.profiles?.role && allowedRoles.has(r.profiles.role)).map(r => r.profile_id)
  } catch {
    return []
  }
}
