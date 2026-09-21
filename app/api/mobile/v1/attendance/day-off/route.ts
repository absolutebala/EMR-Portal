import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { markDayOffCore, cancelDayOffCore } from '@/lib/mobile/core/attendance'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { attendanceDate } = (body ?? {}) as { attendanceDate?: string }

  const result = await markDayOffCore(adminClient(), user.id, { attendanceDate })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}

// Undo an engineer's own (unapproved) Day Off for today.
export async function DELETE(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { attendanceDate } = (body ?? {}) as { attendanceDate?: string }

  const result = await cancelDayOffCore(adminClient(), user.id, { attendanceDate })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
