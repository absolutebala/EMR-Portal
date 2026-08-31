'use server'

import { AdminCreateUserCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_USER_POOL_ID } from '@/lib/cognito/config'
import { adminClient } from '@/lib/db/admin-client'
import { DEFAULT_TEMP_PASSWORD } from '@/lib/cognito/tempPassword'
import { randomUUID } from 'crypto'

export interface BulkUserRow {
  first_name: string
  last_name: string
  employee_id: string
  email: string
  phone: string
  role: string
}

export interface BulkInviteResult {
  email: string
  name: string
  status: 'success' | 'error'
  tempPassword?: string
  error?: string
}

export async function bulkInviteUsers(users: BulkUserRow[]): Promise<BulkInviteResult[]> {
  const admin = adminClient()
  const results: BulkInviteResult[] = []

  for (const user of users) {
    const name = `${user.first_name} ${user.last_name}`

    const { data: existingEmp } = await admin
      .from('profiles').select('id').eq('employee_id', user.employee_id).maybeSingle()
    if (existingEmp) {
      results.push({ email: user.email, name, status: 'error', error: `Employee ID "${user.employee_id}" already exists.` })
      continue
    }

    const tempPassword = DEFAULT_TEMP_PASSWORD
    let cognitoSub: string
    try {
      const result = await cognitoClient.send(new AdminCreateUserCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: user.email,
        UserAttributes: [
          { Name: 'email', Value: user.email },
          { Name: 'email_verified', Value: 'true' },
        ],
        TemporaryPassword: tempPassword,
        MessageAction: 'SUPPRESS',
      }))
      const sub = result.User?.Attributes?.find(a => a.Name === 'sub')?.Value
      if (!sub) {
        results.push({ email: user.email, name, status: 'error', error: 'Could not create the user account.' })
        continue
      }
      cognitoSub = sub
    } catch (e: unknown) {
      results.push({ email: user.email, name, status: 'error', error: e instanceof Error ? e.message : 'Could not create the user account.' })
      continue
    }

    const profileId = randomUUID()
    const { error: profileError } = await admin.from('profiles').insert({
      id: profileId,
      cognito_sub: cognitoSub,
      first_name: user.first_name,
      last_name: user.last_name,
      employee_id: user.employee_id,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      invite_pending: true,
      must_change_password: true,
    })

    if (profileError) {
      await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: user.email })).catch(() => {})
      results.push({ email: user.email, name, status: 'error', error: profileError.message })
      continue
    }

    await admin.from('user_module_access').insert({ user_id: profileId, module: 'field_management' })

    results.push({ email: user.email, name, status: 'success', tempPassword })
  }

  return results
}
