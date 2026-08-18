import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { uploadMyAvatarCore } from '@/lib/mobile/core/profile'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { base64, mimeType, ext } = body as { base64: string; mimeType: string; ext: string }
  if (!base64 || !mimeType || !ext) return NextResponse.json({ url: null, error: 'Missing photo data' }, { status: 400 })

  const result = await uploadMyAvatarCore(adminClient(), user.id, { base64, mimeType, ext })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
