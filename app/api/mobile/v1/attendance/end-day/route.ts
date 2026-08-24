import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { markEndDayCore } from '@/lib/mobile/core/attendance'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { latitude, longitude, placeName } = body as {
    latitude: number | null
    longitude: number | null
    placeName: string | null
  }

  const result = await markEndDayCore(adminClient(), user.id, { latitude, longitude, placeName })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
