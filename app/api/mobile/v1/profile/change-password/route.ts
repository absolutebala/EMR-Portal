import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { changeMyPasswordCore } from '@/lib/mobile/core/profile'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { currentPassword, newPassword } = body as { currentPassword: string; newPassword: string }
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (newPassword.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })

  const result = await changeMyPasswordCore(adminClient(), user.id, currentPassword, newPassword)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
