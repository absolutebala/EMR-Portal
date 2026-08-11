import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { searchProductsCore } from '@/lib/mobile/core/products'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const query = req.nextUrl.searchParams.get('q') || ''
  const result = await searchProductsCore(adminClient(), query)
  return NextResponse.json(result)
}
