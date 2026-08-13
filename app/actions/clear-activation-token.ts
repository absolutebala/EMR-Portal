'use server'

import { adminClient } from '@/lib/db/admin-client'

export async function clearActivationToken(userId: string): Promise<void> {
  await adminClient().from('profiles').update({ activation_token: null }).eq('id', userId)
}
