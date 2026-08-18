import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/cognito/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitCheckInCore } from '@/lib/mobile/core/workOrders'

// Same "PWA cookie session, RN bearer token, one endpoint" shape as
// /api/mobile/submit-form — a stable REST route (not a Server Action, whose action ID
// changes every deploy and can't be called reliably from a service worker background
// sync, which may fire well after the page that queued it was last loaded) is what
// lets the offline check-in queue below actually retry after a fresh deploy.
export async function POST(req: NextRequest) {
  try {
    const bearerUser = await resolveBearerUser(req)
    const user = bearerUser ?? await getAuthedUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { workOrderId, latitude, longitude, placeName, photoBase64, mimeType, ext } = body as {
      workOrderId: string
      latitude: number | null
      longitude: number | null
      placeName: string | null
      photoBase64: string
      mimeType: string
      ext: string
    }

    if (!workOrderId || !photoBase64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await submitCheckInCore(adminClient(), user.id, { workOrderId, latitude, longitude, placeName, photoBase64, mimeType, ext })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
