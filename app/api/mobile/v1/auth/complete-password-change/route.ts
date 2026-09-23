import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { completePasswordChangeCore } from '@/lib/mobile/core/auth'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { phone } = (body ?? {}) as { phone?: string | null }

  const result = await completePasswordChangeCore(adminClient(), user.id, phone)
  // A missing/invalid phone is a client-correctable validation error (400), not a 500.
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
