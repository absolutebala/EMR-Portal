import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getAttendanceCalendarCore } from '@/lib/mobile/core/attendance'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ days: [], error: 'Missing from/to' }, { status: 400 })

  const result = await getAttendanceCalendarCore(adminClient(), user.id, from, to)
  return NextResponse.json(result)
}
