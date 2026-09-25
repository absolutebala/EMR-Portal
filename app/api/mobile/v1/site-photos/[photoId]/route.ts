import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { deleteSitePhotoCore } from '@/lib/mobile/core/sitePhotos'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { photoId } = await params
  const result = await deleteSitePhotoCore(adminClient(), user.id, photoId)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
