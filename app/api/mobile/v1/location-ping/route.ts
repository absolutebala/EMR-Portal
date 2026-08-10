import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { recordLastSeenCore, logLocationPingIssueCore } from '@/lib/mobile/core/dashboard'

// Passive "last seen" ping (mirrors recordLastSeen), or — when the client's own
// geolocation call itself failed — a diagnostic log of why (mirrors
// logLocationPingIssue), distinguished by which fields are present in the body.
export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { lat, lng, reason } = body as { lat?: number; lng?: number; reason?: string }

  if (typeof reason === 'string') {
    logLocationPingIssueCore(user.id, reason)
    return NextResponse.json({ error: null })
  }

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Missing lat/lng or reason' }, { status: 400 })
  }

  return NextResponse.json(await recordLastSeenCore(adminClient(), user.id, lat, lng))
}
