'use server'

import { adminResetPassword } from '@/lib/cognito/admin-reset-password'

export async function resetUserPassword(email: string): Promise<{ error: string | null; tempPassword?: string }> {
  return adminResetPassword(email)
}
