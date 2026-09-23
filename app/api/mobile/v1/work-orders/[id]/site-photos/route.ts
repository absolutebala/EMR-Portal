import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { listSitePhotosCore, addSitePhotosCore } from '@/lib/mobile/core/sitePhotos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const result = await listSitePhotosCore(adminClient(), id)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { photos } = (body ?? {}) as { photos?: { base64: string; mimeType: string; ext: string }[] }
  const result = await addSitePhotosCore(adminClient(), user.id, id, photos ?? [])
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
