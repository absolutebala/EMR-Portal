import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { registerExpoPushTokenCore } from '@/lib/mobile/core/notifications'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { token, platform, deviceName } = body as { token: string; platform: string | null; deviceName: string | null }
  if (!token) return NextResponse.json({ error: 'Missing push token' }, { status: 400 })

  const result = await registerExpoPushTokenCore(adminClient(), user.id, { token, platform: platform ?? null, deviceName: deviceName ?? null })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
