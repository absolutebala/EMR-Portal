'use server'

import { adminResetPassword } from '@/lib/cognito/admin-reset-password'

export async function resendInvite(email: string): Promise<{ error: string | null; tempPassword?: string }> {
  return adminResetPassword(email, { invite_pending: true })
}
