import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
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

    // Save submission
    const { error: subErr } = await admin.from('form_submissions').insert({
      work_order_id: workOrderId,
      form_id: formId,
      submitted_by: user.id,
      form_data: formData,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    // Mark WO as completed
    await admin.from('work_orders').update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', workOrderId)

    // Log activity
    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    await admin.from('work_order_activity').insert({
      work_order_id: workOrderId,
      action: `Form submitted and work order completed by ${actorName}`,
      actor_name: actorName,
    })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
