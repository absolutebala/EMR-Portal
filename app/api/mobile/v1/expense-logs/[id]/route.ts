import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { updateMyExpenseLogCore, deleteMyExpenseLogCore } from '@/lib/mobile/core/expenses'

// Field engineer edits/deletes their own pending expense. Ownership + status are
// enforced in the core.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { expenseTypeId, expenseDate, amount } = body as { expenseTypeId: string; expenseDate: string; amount: number }

  const result = await updateMyExpenseLogCore(adminClient(), user.id, id, { expenseTypeId, expenseDate, amount })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params

  const result = await deleteMyExpenseLogCore(adminClient(), user.id, id)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
