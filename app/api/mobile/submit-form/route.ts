import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { workOrderId, formId, formData } = body as {
      workOrderId: string
      formId: string
      formData: Record<string, unknown>
    }

    if (!workOrderId || !formId || !formData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const admin = adminClient()

    // Upsert — a work order can be revisited (e.g. after being marked pending), and the
    // engineer resubmitting the same form should update the existing row, not duplicate it.
    const { error: subErr } = await admin.from('form_submissions').upsert({
      work_order_id: workOrderId,
      form_id: formId,
      submitted_by: user.id,
      form_data: formData,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'work_order_id,form_id' })

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    // Status transitions (completed/pending/needs_reassignment) and visit sign-off
    // (signatures, PDF, mocked SAP send) happen at end-of-day closure, not here.
    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    await admin.from('work_order_activity').insert({
      work_order_id: workOrderId,
      action: `Form submitted by ${actorName}`,
      actor_name: actorName,
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
