import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitDailyClosureCore } from '@/lib/mobile/core/workOrders'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveBearerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const {
    outcome, summary, pendingReason, materialsRequired, revisitDate,
    needsReassignment, engineerSignature, clientName, clientSignature, clientPhone, engineerPhone, offSite,
  } = body as {
    outcome: 'completed' | 'pending'
    summary: string
    pendingReason: string | null
    materialsRequired: string | null
    revisitDate: string | null
    needsReassignment: boolean
    engineerSignature: string
    clientName: string
    clientSignature: string
    clientPhone?: string | null
    engineerPhone?: string | null
    offSite?: boolean
  }
  // Completion is a plain action now (sign-off lives on the forms); only a pending
  // closure requires the engineer's signature.
  if (!outcome || (outcome === 'pending' && !engineerSignature)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await submitDailyClosureCore(adminClient(), user.id, {
    workOrderId: id, outcome, summary, pendingReason, materialsRequired, revisitDate,
    needsReassignment, engineerSignature, clientName, clientSignature, clientPhone, engineerPhone, offSite,
  })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
