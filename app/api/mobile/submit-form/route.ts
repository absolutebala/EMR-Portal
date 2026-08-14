import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/cognito/server'
import { resolveBearerUser } from '@/lib/mobile/apiAuth'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitJobFormCore } from '@/lib/mobile/core/workOrders'

// Shared by both the PWA (cookie session) and the RN app (bearer token) — this route
// predates the /api/mobile/v1/* convention used everywhere else for RN, and rather
// than duplicating it there, bearer auth is just tried first here with a fallback to
// the existing cookie flow, so there's only one submit-form endpoint to maintain.
export async function POST(req: NextRequest) {
  try {
    const bearerUser = await resolveBearerUser(req)
    const user = bearerUser ?? await getAuthedUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { workOrderId, formId, formData } = body as {
      workOrderId: string
      formId: string
      formData: { fields: Record<string, string>; table_rows: Record<string, unknown> }
    }

    if (!workOrderId || !formId || !formData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await submitJobFormCore(adminClient(), user.id, { workOrderId, formId, formData })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    return NextResponse.json({ success: true, completed: result.completed })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
