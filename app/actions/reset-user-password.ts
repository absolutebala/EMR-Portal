'use server'

import { adminResetPassword } from '@/lib/cognito/admin-reset-password'
import { getAuthedUser } from '@/lib/cognito/server'
import { adminClient } from '@/lib/db/admin-client'

// Roles allowed to reset another user's password. Super Admin / Head of Service are
// full-access; Service Manager was granted reset (only) per business request. Any
// other role still passes if its configurable 'Users — Create / Edit' permission is on.
const RESET_ALLOWED_ROLES = new Set(['Super Admin', 'Head of Service', 'Service Manager'])

export async function resetUserPassword(email: string): Promise<{ error: string | null; tempPassword?: string }> {
  // Server-side authorization — the button is also hidden client-side, but that alone
  // is not a real guard since the action can be invoked directly.
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated.' }

  const sb = adminClient()
  const { data: actor } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = actor?.role || ''

  let allowed = RESET_ALLOWED_ROLES.has(role)
  if (!allowed) {
    const { data: roleRow } = await sb.from('roles').select('permissions').eq('name', role).maybeSingle()
    const perms = (roleRow?.permissions as Record<string, boolean> | null) || {}
    allowed = perms['Users — Create / Edit'] === true
  }
  if (!allowed) return { error: 'You do not have permission to reset passwords.' }

  return adminResetPassword(email)
}
