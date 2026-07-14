import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'
import { generateVisitPdf } from '@/lib/mobile/generateVisitPdf'

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
    const {
      workOrderId, formId, formData, visitType,
      engineerSignature, clientName, clientSignature,
    } = body as {
      workOrderId: string
      formId: string
      formData: { fields?: Record<string, string>; table_rows?: Record<string, { status: string; remarks: string }> }
      visitType?: 'followup' | 'final'
      engineerSignature?: string | null
      clientName?: string | null
      clientSignature?: string | null
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

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'

    // No visit sign-off on this submission (e.g. an older client) — just log the form save.
    if (!visitType) {
      await admin.from('work_order_activity').insert({
        work_order_id: workOrderId,
        action: `Form submitted by ${actorName}`,
        actor_name: actorName,
      })
      return NextResponse.json({ success: true })
    }

    let pdfUrl: string | null = null
    let sentToSap = false
    let sentToSapAt: string | null = null

    if (visitType === 'final') {
      const [{ data: wo }, { data: formRow }] = await Promise.all([
        admin.from('work_orders').select('wo_number, job_type, customer_id').eq('id', workOrderId).single(),
        admin.from('forms').select('name').eq('id', formId).single(),
      ])

      if (wo) {
        const [{ data: customer }, { data: wotRows }, { data: secs }] = await Promise.all([
          admin.from('customers').select('name').eq('id', wo.customer_id).single(),
          admin.from('work_order_transformers').select('transformers(serial_number)').eq('work_order_id', workOrderId),
          admin.from('form_sections')
            .select('title, order_index, form_fields(id, label, field_type, order_index), form_tables(order_index, form_table_rows(id, row_label, sno_label, order_index))')
            .eq('form_id', formId)
            .order('order_index'),
        ])

        type WotRow = { transformers: { serial_number: string } | null }
        const serialNumbers = ((wotRows as unknown as WotRow[]) || []).map(r => r.transformers?.serial_number).filter(Boolean).join(', ')

        type SectionEmbed = {
          title: string; order_index: number
          form_fields: { id: string; label: string; field_type: string; order_index: number }[]
          form_tables: { order_index: number; form_table_rows: { id: string; row_label: string; sno_label: string | null; order_index: number }[] }[]
        }
        const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index
        const sections = ((secs as unknown as SectionEmbed[]) || []).slice().sort(byOrder).map(s => ({
          title: s.title,
          fields: (s.form_fields || []).slice().sort(byOrder),
          tables: (s.form_tables || []).slice().sort(byOrder).map(t => ({ rows: (t.form_table_rows || []).slice().sort(byOrder) })),
        }))

        try {
          const pdfBuffer = await generateVisitPdf({
            woNumber: wo.wo_number,
            jobType: wo.job_type,
            customerName: customer?.name || '',
            serialNumbers,
            engineerName: actorName,
            clientName: clientName || null,
            visitType: 'final',
            sections,
            fieldValues: formData.fields || {},
            rowValues: formData.table_rows || {},
            engineerSignature: engineerSignature || null,
            clientSignature: clientSignature || null,
          })

          const path = `visit-pdfs/${workOrderId}-${Date.now()}.pdf`
          const { error: upErr } = await admin.storage.from('assets').upload(path, pdfBuffer, { upsert: true, contentType: 'application/pdf' })
          if (!upErr) {
            pdfUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
            // "Sent to SAP" is mocked — there is no real SAP integration. We generate the
            // PDF for real and flag it as sent so the desktop UI reflects intent honestly
            // rather than pretending a live API call happened.
            sentToSap = true
            sentToSapAt = new Date().toISOString()
          }
        } catch (e) {
          console.error('generateVisitPdf failed:', e)
        }

        void formRow // form name currently unused in the PDF beyond section content; reserved for future header use
      }
    }

    await admin.from('work_order_visits').insert({
      work_order_id: workOrderId,
      engineer_id: user.id,
      visit_type: visitType,
      form_data: formData,
      engineer_signature: engineerSignature || null,
      client_name: clientName || null,
      client_signature: clientSignature || null,
      pdf_url: pdfUrl,
      sent_to_sap: sentToSap,
      sent_to_sap_at: sentToSapAt,
    })

    await admin.from('work_order_activity').insert({
      work_order_id: workOrderId,
      action: visitType === 'final'
        ? `Final visit submitted by ${actorName}${sentToSap ? ' — PDF sent to SAP' : ''}`
        : `Follow-up visit saved by ${actorName}`,
      actor_name: actorName,
    })

    return NextResponse.json({ success: true, pdfUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
