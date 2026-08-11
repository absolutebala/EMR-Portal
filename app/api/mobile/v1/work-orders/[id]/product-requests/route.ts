import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitProductRequestCore } from '@/lib/mobile/core/products'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { items, damagePhotos } = body as {
    items: { productId: string; quantity: number }[]
    damagePhotos: { base64: string; mimeType: string; ext: string }[]
  }

  const result = await submitProductRequestCore(adminClient(), user.id, { workOrderId: id, items, damagePhotos })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
