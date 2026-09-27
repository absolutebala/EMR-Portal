import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { recordLoginEventCore } from '@/lib/mobile/core/loginEvents'

// Records a mobile login with the device + location it came from (see login_events).
// Best-effort — a failure never blocks the app; the client fires this and moves on.
export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { deviceId, latitude, longitude, placeName } = body as {
    deviceId?: string | null; latitude?: number | null; longitude?: number | null; placeName?: string | null
  }

  const result = await recordLoginEventCore(adminClient(), user.id, {
    deviceId: deviceId ?? null,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    placeName: placeName ?? null,
  })
  return NextResponse.json(result)
}
