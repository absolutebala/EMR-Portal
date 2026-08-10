'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { adminClient } from '@/lib/mobile/core/shared'
import { completePasswordChangeCore } from '@/lib/mobile/core/auth'

export async function completePasswordChange(): Promise<{ error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return completePasswordChangeCore(adminClient(), user.id)
}
