import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getOverdueFollowUpsCore, checkOpenVisitFollowUpCore, checkNotStartedFollowUpCore, rescheduleFollowUpCore } from '@/lib/mobile/core/dashboard'

// Combines the three dashboard-load follow-up checks into one round trip: date-based
// overdue jobs, the same-day "still checked in, never closed out" nudge, and (only
// when ?lat=&lng= are supplied) the "committed to travel but hasn't moved" notice —
// mirrors getOverdueFollowUps + checkOpenVisitFollowUp + checkNotStartedFollowUp.
export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = adminClient()
  const latParam = req.nextUrl.searchParams.get('lat')
  const lngParam = req.nextUrl.searchParams.get('lng')
  const lat = latParam ? Number(latParam) : null
  const lng = lngParam ? Number(lngParam) : null

  const [overdue, openCheckin, notStarted] = await Promise.all([
    getOverdueFollowUpsCore(admin, user.id),
    checkOpenVisitFollowUpCore(admin, user.id),
    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? checkNotStartedFollowUpCore(admin, user.id, lat, lng)
      : Promise.resolve({ notice: null, error: null }),
  ])

  return NextResponse.json({
    followUps: overdue.followUps,
    openCheckin: openCheckin.followUp,
    notStarted: notStarted.notice,
    error: overdue.error || openCheckin.error || notStarted.error,
  })
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { workOrderId, newDate, offSite } = body as { workOrderId: string; newDate: string; offSite?: boolean }
  if (!workOrderId || !newDate) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const result = await rescheduleFollowUpCore(adminClient(), user.id, workOrderId, newDate, offSite)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
