import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { markNotificationReadCore } from '@/lib/mobile/core/notifications'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const result = await markNotificationReadCore(adminClient(), user.id, id)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
