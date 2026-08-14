'use server'

import { clearSessionCookie } from '@/lib/cognito/session'

export async function logout(): Promise<void> {
  await clearSessionCookie()
}
