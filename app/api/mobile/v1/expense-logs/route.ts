import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMyExpenseLogsCore, submitExpenseLogCore } from '@/lib/mobile/core/expenses'
import type { ClaimType } from '@/lib/travelGuidelines'

export async function GET(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const result = await getMyExpenseLogsCore(adminClient(), user.id)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { workOrderId, expenseTypeId, expenseDate, amount, claimType, photo } = body as {
    workOrderId: string
    expenseTypeId: string
    expenseDate: string
    amount: number
    claimType?: ClaimType
    photo?: { base64: string; mimeType: string; ext: string }
  }

  const result = await submitExpenseLogCore(adminClient(), user.id, { workOrderId, expenseTypeId, expenseDate, amount, claimType, photo })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
