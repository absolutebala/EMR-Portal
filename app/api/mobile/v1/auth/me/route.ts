import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient, getEngineerName } from '@/lib/mobile/core/shared'
import { mustChangePasswordCore } from '@/lib/mobile/core/auth'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = adminClient()
  const [mustChangePassword, engineer] = await Promise.all([
    mustChangePasswordCore(admin, user.id),
    getEngineerName(admin, user.id),
  ])

  return NextResponse.json({ mustChangePassword, engineer, error: null })
}
