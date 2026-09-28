import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { rescheduleNotificationCore } from '@/lib/mobile/core/workOrders'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { newDate } = body as { newDate?: string }
  const result = await rescheduleNotificationCore(adminClient(), user.id, id, newDate || '')
  return NextResponse.json(result)
}
