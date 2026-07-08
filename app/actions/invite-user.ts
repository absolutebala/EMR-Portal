'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function inviteUser(payload: {
  email: string
  first_name: string
  last_name: string
  employee_id: string
  phone: string | null
  role: string
  manager_id: string | null
}): Promise<{ error: string | null; inviteLink?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set.' }
  }

  const sSb = await serverClient()
  const { data: { user: currentUser } } = await sSb.auth.getUser()

  // createClient from supabase-js with service role key = full admin access, bypasses RLS
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify the admin's profile row exists and get their role (needed for FK + Super Admin guard)
  let createdBy: string | null = null
  let creatorRole: string | null = null
  if (currentUser?.id) {
    const { data: adminProfile } = await supabase.from('profiles').select('id, role').eq('id', currentUser.id).maybeSingle()
    createdBy = adminProfile?.id ?? null
    creatorRole = adminProfile?.role ?? null
  }

  // Only block if we positively know the creator is not a Super Admin
  if (payload.role === 'Super Admin' && creatorRole !== null && creatorRole !== 'Super Admin') {
    return { error: 'Only Super Admins can assign the Super Admin role.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'

  // Check for duplicate employee ID
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('employee_id', payload.employee_id)
    .maybeSingle()

  if (existing) return { error: `Employee ID "${payload.employee_id}" is already assigned to another user.` }

  // Generate invite link without sending an email — avoids rate limits
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: payload.email,
    options: { redirectTo: `${siteUrl}/set-password` },
  })

  if (linkError) return { error: linkError.message }

  const userId = linkData.user.id
  const activationToken = randomUUID()
  const inviteLink = `${siteUrl}/activate-account?token=${activationToken}`

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
    activation_token: activationToken,
  })

  if (profileError) return { error: profileError.message }

  await supabase.from('user_module_access').insert({
    user_id: userId,
    module: 'field_management',
  })

  return { error: null, inviteLink }
}
