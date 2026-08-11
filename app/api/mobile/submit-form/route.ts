import { NextRequest, NextResponse } from 'next/server'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { adminClient } from '@/lib/mobile/core/shared'
import { submitJobFormCore } from '@/lib/mobile/core/workOrders'

export async function POST(req: NextRequest) {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
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
