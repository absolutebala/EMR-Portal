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
      const { data: guardTarget } = await admin.from('profiles').select('created_by, role').eq('id', targetUserId).single()
      // Service Managers may delete any Field Engineer; for other roles they're limited
      // to accounts they created themselves.
      if (guardTarget?.role !== 'Field Engineer' && guardTarget?.created_by !== user.id) {
        return { error: 'Permission denied. You can only delete field engineers or users you created.' }
      }
    }

    const { data: target } = await admin.from('profiles').select('first_name, last_name, email, role').eq('id', targetUserId).maybeSingle()
    if (!target) return { error: 'User not found.' }

    // Revert this engineer's open jobs to 'unassigned' BEFORE the profile is deleted —
    // work_orders.engineer_id is ON DELETE SET NULL, so deleting the profile would
    // otherwise null the engineer while leaving status 'assigned'/'in_progress',
    // producing a contradictory "Unassigned engineer / Assigned status" row. Done
    // while engineer_id still points at them so the WHERE matches. Same transition
    // updateWorkOrder applies when an engineer is removed through the UI.
    await admin.from('work_orders')
      .update({ status: 'unassigned', updated_at: new Date().toISOString() })
      .eq('engineer_id', targetUserId)
      .in('status', ['assigned', 'in_progress'])

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
    const targetKind = target.role === 'Field Engineer' ? 'field engineer' : 'user'
    await logActivity(admin, { actorId: user.id, actorName, action: `Deleted ${targetKind} ${targetName}`, entityType: 'user', entityId: targetUserId })
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
