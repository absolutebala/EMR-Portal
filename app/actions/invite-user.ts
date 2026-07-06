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
}): Promise<{ error: string | null; inviteLink?: string }> {
  const cookieStore = await cookies()

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emr-portal-three.vercel.app'

  // Generate invite link without sending an email — avoids rate limits
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: payload.email,
    options: { redirectTo: `${siteUrl}/login` },
  })

  if (linkError) return { error: linkError.message }

  const userId = linkData.user.id
  const inviteLink = linkData.properties?.action_link

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

  return { error: null, inviteLink }
}
