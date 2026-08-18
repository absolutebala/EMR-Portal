import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient, getEngineerName } from '@/lib/mobile/core/shared'
import { mustChangePasswordCore } from '@/lib/mobile/core/auth'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = adminClient()
  const [mustChangePassword, engineer, { data: profile }] = await Promise.all([
    mustChangePasswordCore(admin, user.id),
    getEngineerName(admin, user.id),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])

  // The RN app is Field-Engineer-only — AuthContext.tsx signs out and blocks access
  // for any other role using this field, same restriction the PWA's login/challenge
  // actions enforce server-side before ever setting a session cookie.
  return NextResponse.json({ mustChangePassword, engineer, role: profile?.role ?? null, error: null })
}
