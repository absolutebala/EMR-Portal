import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getNearbyEngineersCore } from '@/lib/mobile/core/nearby'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const lat = Number(req.nextUrl.searchParams.get('lat'))
  const lng = Number(req.nextUrl.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ engineers: [], error: 'Missing lat/lng' }, { status: 400 })

  const radiusParam = req.nextUrl.searchParams.get('radiusKm')
  const radiusKm = radiusParam != null && Number.isFinite(Number(radiusParam)) ? Number(radiusParam) : undefined

  return NextResponse.json(await getNearbyEngineersCore(adminClient(), user.id, lat, lng, radiusKm))
}
