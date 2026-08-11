import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getExpenseEligibilityCore } from '@/lib/mobile/core/expenses'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const result = await getExpenseEligibilityCore(adminClient(), user.id, id)
  return NextResponse.json(result)
}
