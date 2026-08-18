import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { markProductReceivedCore } from '@/lib/mobile/core/products'

export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { itemId } = await params
  const result = await markProductReceivedCore(adminClient(), user.id, itemId)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
