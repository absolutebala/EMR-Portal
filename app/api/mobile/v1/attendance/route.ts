import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMyAttendanceStatusCore, markAttendanceCore } from '@/lib/mobile/core/attendance'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { status, error } = await getMyAttendanceStatusCore(adminClient(), user.id)
  return NextResponse.json({ status, error })
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { latitude, longitude, placeName, reason, attendanceDate } = body as {
    latitude: number | null
    longitude: number | null
    placeName: string | null
    reason?: string | null
    attendanceDate?: string
  }

  const result = await markAttendanceCore(adminClient(), user.id, { latitude, longitude, placeName, reason, attendanceDate })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
