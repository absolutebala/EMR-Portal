import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { sendExpenseReminderCore } from '@/lib/mobile/core/expenses'

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await sendExpenseReminderCore(adminClient(), user.id)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
