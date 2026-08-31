'use server'

import { AdminDeleteUserCommand, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient } from '@/lib/cognito/client'
import { COGNITO_USER_POOL_ID } from '@/lib/cognito/config'
import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { adminClient } from '@/lib/db/admin-client'

export async function deleteUser(targetUserId: string): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated.' }
    if (user.id === targetUserId) return { error: 'You cannot delete your own account.' }

    const admin = adminClient()
    const { data: currentProfile } = await admin.from('profiles').select('role, first_name, last_name').eq('id', user.id).single()

    if (currentProfile?.role === 'Service Manager') {
      const { data: target } = await admin.from('profiles').select('created_by').eq('id', targetUserId).single()
      if (target?.created_by !== user.id) return { error: 'Permission denied. You can only delete users you created.' }
    }

    const { data: target } = await admin.from('profiles').select('first_name, last_name, email').eq('id', targetUserId).maybeSingle()
    if (!target) return { error: 'User not found.' }

    // No more FK cascade like Supabase's auth.users had (Cognito and RDS are separate
    // systems) — delete the Cognito identity first, then the profile row explicitly.
    // If the Cognito delete fails, the profile stays intact and this is safe to retry;
    // the alternative order risks an orphaned Cognito identity with no profile at all.
    // UserNotFoundException is expected and harmless for a profile carried over from
    // the Supabase->AWS migration whose owner never logged in since — the lazy
    // migrate-on-login path never ran, so there's no Cognito identity to delete;
    // fall through and just remove the profile row.
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: target.email }))
    } catch (e: unknown) {
      if (!(e instanceof UserNotFoundException)) {
        return { error: e instanceof Error ? e.message : 'Could not delete the user account.' }
      }
    }

    const { error } = await admin.from('profiles').delete().eq('id', targetUserId)
    if (error) {
      // A foreign-key violation (Postgres 23503) surfaces as an unreadable
      // "...violates foreign key constraint ... on table ..." string. Every table
      // that holds a user's own records is set to cascade/null on delete, so this
      // should only happen if a new table adds a blocking reference later — give a
      // readable message instead of the raw constraint text.
      if (error.code === '23503') {
        return { error: 'This user still has linked records that must be removed or reassigned before the account can be deleted.' }
      }
      return { error: error.message }
    }
    const actorName = currentProfile ? `${currentProfile.first_name} ${currentProfile.last_name}` : 'Admin'
    const targetName = `${target.first_name} ${target.last_name}`
    await logActivity(admin, { actorId: user.id, actorName, action: `Deleted user ${targetName}`, entityType: 'user', entityId: targetUserId })
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
