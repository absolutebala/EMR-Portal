import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMobileWorkOrderWithFormCore } from '@/lib/mobile/core/workOrders'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const view = req.nextUrl.searchParams.get('view') || undefined
  return NextResponse.json(await getMobileWorkOrderWithFormCore(adminClient(), user.id, id, view))
}
