import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getExpenseTypesCore, getOrCreateExpenseTypeCore } from '@/lib/mobile/core/expenses'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await getExpenseTypesCore(adminClient())
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { name } = body as { name: string }
  const result = await getOrCreateExpenseTypeCore(adminClient(), name)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
