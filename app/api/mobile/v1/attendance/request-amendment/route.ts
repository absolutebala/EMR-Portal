import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { requestAttendanceAmendmentCore } from '@/lib/mobile/core/attendance'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { attendanceDate, reason } = body as { attendanceDate: string; reason: string }

  const result = await requestAttendanceAmendmentCore(adminClient(), user.id, { attendanceDate, reason })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
