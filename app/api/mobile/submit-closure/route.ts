import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/cognito/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitDailyClosureCore } from '@/lib/mobile/core/workOrders'

// Same "PWA cookie session, RN bearer token, one endpoint" shape as
// /api/mobile/submit-checkin — a stable REST route (not a Server Action, whose action
// ID changes every deploy and can't be called reliably from a service worker
// background sync) is what lets the offline closure queue below actually retry after
// a fresh deploy.
export async function POST(req: NextRequest) {
  try {
    const bearerUser = await resolveBearerUser(req)
    const user = bearerUser ?? await getAuthedUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { workOrderId, outcome, summary, pendingReason, materialsRequired, revisitDate, needsReassignment, engineerSignature, clientName, clientSignature, offSite } = body as {
      workOrderId: string
      outcome: 'completed' | 'pending'
      summary: string
      pendingReason: string | null
      materialsRequired: string | null
      revisitDate: string | null
      needsReassignment: boolean
      engineerSignature: string
      clientName: string
      clientSignature: string
      offSite?: boolean
    }

    if (!workOrderId || !outcome) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await submitDailyClosureCore(adminClient(), user.id, {
      workOrderId, outcome, summary, pendingReason, materialsRequired, revisitDate,
      needsReassignment, engineerSignature, clientName, clientSignature, offSite,
    })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
