'use server'

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '@#$!'
  const all = upper + lower + digits + special
  const bytes = randomBytes(8)
  const chars = Array.from(bytes).map(b => all[b % all.length])
  chars[0] = upper[randomBytes(1)[0] % upper.length]
  chars[1] = lower[randomBytes(1)[0] % lower.length]
  chars[2] = digits[randomBytes(1)[0] % digits.length]
  chars[3] = special[randomBytes(1)[0] % special.length]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export async function resendInvite(email: string): Promise<{ error: string | null; tempPassword?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Server configuration error.' }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!profile) return { error: 'User not found.' }

  const tempPassword = generateTempPassword()

  const { error: authError } = await supabase.auth.admin.updateUserById(profile.id, {
    password: tempPassword,
  })

  if (authError) return { error: authError.message }

  await supabase
    .from('profiles')
    .update({ must_change_password: true, invite_pending: true })
    .eq('id', profile.id)

  return { error: null, tempPassword }
}
