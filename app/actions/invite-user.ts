'use server'

import { AdminCreateUserCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_USER_POOL_ID } from '@/lib/cognito/config'
import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { adminClient } from '@/lib/db/admin-client'
import { randomBytes, randomUUID } from 'crypto'

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '@#$!'
  const all = upper + lower + digits + special
  const bytes = randomBytes(8)
  const chars = Array.from(bytes).map(b => all[b % all.length])
  // Guarantee one of each required class
  chars[0] = upper[randomBytes(1)[0] % upper.length]
  chars[1] = lower[randomBytes(1)[0] % lower.length]
  chars[2] = digits[randomBytes(1)[0] % digits.length]
  chars[3] = special[randomBytes(1)[0] % special.length]
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export async function inviteUser(payload: {
  email: string
  first_name: string
  last_name: string
  employee_id: string
  phone: string | null
  role: string
  manager_id: string | null
  grade: string | null
}): Promise<{ error: string | null; tempPassword?: string }> {
  const currentUser = await getAuthedUser()
  const admin = adminClient()

  let createdBy: string | null = null
  let creatorRole: string | null = null
  let creatorName = 'Admin'
  if (currentUser?.id) {
    const { data: adminProfile } = await admin.from('profiles').select('id, role, first_name, last_name').eq('id', currentUser.id).maybeSingle()
    createdBy = adminProfile?.id ?? null
    creatorRole = adminProfile?.role ?? null
    if (adminProfile) creatorName = `${adminProfile.first_name} ${adminProfile.last_name}`
  }

  const ADMIN_ROLES = ['Super Admin', 'Head of Service']
  if (ADMIN_ROLES.includes(payload.role) && creatorRole !== null && !ADMIN_ROLES.includes(creatorRole)) {
    return { error: 'Only a Super Admin or Head of Service can assign that role.' }
  }

  // Check for duplicate employee ID
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('employee_id', payload.employee_id)
    .maybeSingle()

  if (existing) return { error: `Employee ID "${payload.employee_id}" is already assigned to another user.` }

  const tempPassword = generateTempPassword()

  // Create the Cognito identity with a known temporary password — no invite email at
  // all (MessageAction: SUPPRESS); the temp password is shown to the inviting admin
  // to share out-of-band, and the new user hits Cognito's NEW_PASSWORD_REQUIRED
  // challenge on their first login (see app/actions/login.ts).
  let cognitoSub: string
  try {
    const result = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: payload.email,
      UserAttributes: [
        { Name: 'email', Value: payload.email },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS',
    }))
    const sub = result.User?.Attributes?.find(a => a.Name === 'sub')?.Value
    if (!sub) return { error: 'Could not create the user account. Please try again.' }
    cognitoSub = sub
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Could not create the user account.' }
  }

  // profiles.id is NOT Cognito's sub (confirmed in Phase A: Cognito ignores any forced
  // username/sub value) — it's a fresh id here, same as it always was for a genuinely
  // new user, with cognito_sub as the separate mapping column proxy.ts and
  // resolveBearerUser resolve identity through.
  const profileId = randomUUID()
  const { error: profileError } = await admin.from('profiles').insert({
    id: profileId,
    cognito_sub: cognitoSub,
    first_name: payload.first_name,
    last_name: payload.last_name,
    employee_id: payload.employee_id,
    email: payload.email,
    phone: payload.phone,
    role: payload.role,
    manager_id: payload.manager_id,
    grade: payload.grade,
    created_by: createdBy,
    invite_pending: true,
    must_change_password: true,
  })

  if (profileError) {
    // Don't leave an orphaned Cognito identity with no profile row behind.
    await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: payload.email })).catch(() => {})
    return { error: profileError.message }
  }

  await admin.from('user_module_access').insert({
    user_id: profileId,
    module: 'field_management',
  })

  await logActivity(admin, {
    actorId: currentUser?.id ?? null,
    actorName: creatorName,
    action: `Invited user ${payload.first_name} ${payload.last_name} (${payload.role})`,
    entityType: 'user',
    entityId: profileId,
  })

  return { error: null, tempPassword }
}
