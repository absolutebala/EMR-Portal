import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMyProfileCore, updateMyProfileCore } from '@/lib/mobile/core/profile'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(await getMyProfileCore(adminClient(), user.id))
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { firstName, lastName, phone } = body as { firstName: string; lastName: string; phone: string | null }
  if (!firstName?.trim() || !lastName?.trim()) return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })

  const result = await updateMyProfileCore(adminClient(), user.id, { firstName: firstName.trim(), lastName: lastName.trim(), phone })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
