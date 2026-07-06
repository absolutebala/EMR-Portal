'use server'

import { createClient } from '@supabase/supabase-js'

export interface BulkUserRow {
  first_name: string
  last_name: string
  employee_id: string
  email: string
  phone: string
  role: string
}

export interface BulkInviteResult {
  email: string
  name: string
  status: 'success' | 'error'
  inviteLink?: string
  error?: string
}

export async function bulkInviteUsers(users: BulkUserRow[]): Promise<BulkInviteResult[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return users.map(u => ({ email: u.email, name: `${u.first_name} ${u.last_name}`, status: 'error', error: 'Server configuration error.' }))
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'
  const results: BulkInviteResult[] = []

  for (const user of users) {
    const name = `${user.first_name} ${user.last_name}`

    // Check duplicate employee ID
    const { data: existingEmp } = await supabase
      .from('profiles').select('id').eq('employee_id', user.employee_id).maybeSingle()
    if (existingEmp) {
      results.push({ email: user.email, name, status: 'error', error: `Employee ID "${user.employee_id}" already exists.` })
      continue
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: user.email,
      options: { redirectTo: `${siteUrl}/set-password` },
    })

    if (linkError) {
      results.push({ email: user.email, name, status: 'error', error: linkError.message })
      continue
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: linkData.user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      employee_id: user.employee_id,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      invite_pending: true,
    })

    if (profileError) {
      results.push({ email: user.email, name, status: 'error', error: profileError.message })
      continue
    }

    await supabase.from('user_module_access').insert({ user_id: linkData.user.id, module: 'field_management' })

    results.push({ email: user.email, name, status: 'success', inviteLink: linkData.properties?.action_link })
  }

  return results
}
