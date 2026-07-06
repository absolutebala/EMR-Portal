'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function inviteUser(payload: {
  email: string
  first_name: string
  last_name: string
  employee_id: string
  phone: string | null
  department: string | null
  role: string
}) {
  const cookieStore = await cookies()

  // Admin client uses the service role key — stays server-side only
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  // Send a Supabase invite email so the user sets their own password
  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    payload.email,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'}/login` }
  )

  if (inviteError) return { error: inviteError.message }

  const userId = data.user.id

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    first_name: payload.first_name,
    last_name: payload.last_name,
    employee_id: payload.employee_id,
    email: payload.email,
    phone: payload.phone,
    department: payload.department,
    role: payload.role,
  })

  if (profileError) return { error: profileError.message }

  await supabase.from('user_module_access').insert({
    user_id: userId,
    module: 'field_management',
  })

  return { error: null }
}
