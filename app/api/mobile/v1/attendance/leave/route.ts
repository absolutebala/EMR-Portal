import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { applyForLeaveCore, getMyLeaveRequestsCore } from '@/lib/mobile/core/attendance'

// The engineer's own Apply-for-Leave requests: GET lists them, POST files a new one.
// Manager approval lives on the desktop Attendance page.
export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { requests, error } = await getMyLeaveRequestsCore(adminClient(), user.id)
  return NextResponse.json({ requests, error })
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { fromDate, toDate, reason } = body as { fromDate: string; toDate: string; reason: string }

  const result = await applyForLeaveCore(adminClient(), user.id, { fromDate, toDate, reason })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
