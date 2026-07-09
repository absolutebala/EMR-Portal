'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

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
}): Promise<{ error: string | null; tempPassword?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const sSb = await serverClient()
  const { data: { user: currentUser } } = await sSb.auth.getUser()

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let createdBy: string | null = null
  let creatorRole: string | null = null
  if (currentUser?.id) {
    const { data: adminProfile } = await supabase.from('profiles').select('id, role').eq('id', currentUser.id).maybeSingle()
    createdBy = adminProfile?.id ?? null
    creatorRole = adminProfile?.role ?? null
  }

  if (payload.role === 'Super Admin' && creatorRole !== null && creatorRole !== 'Super Admin') {
    return { error: 'Only Super Admins can assign the Super Admin role.' }
  }

  // Check for duplicate employee ID
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', payload.employee_id)
    .maybeSingle()

  if (existing) return { error: `Employee ID "${payload.employee_id}" is already assigned to another user.` }

  const tempPassword = generateTempPassword()

  // Create auth user with a known temporary password
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })

  if (authError) return { error: authError.message }

  const userId = authData.user.id

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    first_name: payload.first_name,
    last_name: payload.last_name,
    employee_id: payload.employee_id,
    email: payload.email,
    phone: payload.phone,
    role: payload.role,
    manager_id: payload.manager_id,
    created_by: createdBy,
    invite_pending: true,
    must_change_password: true,
  })

  if (profileError) return { error: profileError.message }

  await supabase.from('user_module_access').insert({
    user_id: userId,
    module: 'field_management',
  })

  return { error: null, tempPassword }
}
