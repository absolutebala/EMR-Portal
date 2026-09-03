import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { listTransformersForCustomerCore } from '@/lib/mobile/core/create-notification'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const customerId = req.nextUrl.searchParams.get('customerId') || ''
  const result = await listTransformersForCustomerCore(adminClient(), customerId)
  return NextResponse.json(result)
}
