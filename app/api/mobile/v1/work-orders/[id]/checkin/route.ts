import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitCheckInCore } from '@/lib/mobile/core/workOrders'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { latitude, longitude, placeName, photoBase64, mimeType, ext } = body as {
    latitude: number | null
    longitude: number | null
    placeName: string | null
    photoBase64: string
    mimeType: string
    ext: string
  }
  if (!photoBase64 || !mimeType || !ext) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await submitCheckInCore(adminClient(), user.id, {
    workOrderId: id, latitude, longitude, placeName, photoBase64, mimeType, ext,
  })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
