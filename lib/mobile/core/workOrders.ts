import { logActivity as logSystemActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import { generateVisitPdf } from '@/lib/mobile/generateVisitPdf'
import { generateVisitWord } from '@/lib/mobile/generateVisitWord'
import {
  type AdminClient, type MobileWorkOrderWithCustomer, type MobileWorkOrderDetail,
  type MobileForm, type MobileFormField, type MobileFormRow, type MobileFormSection, type MobileFormTable,
  touchHeartbeat, fetchSingleWorkOrder, withTimeout, logActivity,
} from './shared'

// "Engineer signature" and "Customer signature" are the fixed, standard field labels
// every form built in the Form Builder includes (confirmed with the user) — used to
// find the right fields below without needing a dedicated schema flag.
const ENGINEER_SIGNATURE_LABEL = /engineer signature/i
const CUSTOMER_SIGNATURE_LABEL = /customer signature/i

// For screens (check-in, closure) that only need the work order + customer info,
// not the full hub detail (checkin history, closures, previous visits) — no reason
// to pay for those extra queries on a page that never renders them.
export async function getMobileWorkOrderBasicCore(admin: AdminClient, userId: string, woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, error: 'Notification not found' }
    return { workOrder, error: null }
  } catch (e: unknown) {
    return { workOrder: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileWorkOrderWithFormCore(admin: AdminClient, userId: string, woId: string): Promise<{
  workOrder: MobileWorkOrderWithCustomer | null
  form: MobileForm | null
  existingSubmission: { id: string; form_data: Record<string, unknown> } | null
  error: string | null
}> {
  try {
    touchHeartbeat(admin, userId)

    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, form: null, existingSubmission: null, error: 'Notification not found' }

    const { data: engineerProfile } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
    workOrder.engineer_name = engineerProfile ? `${engineerProfile.first_name} ${engineerProfile.last_name}` : null

    // Find the active form for this job type
    const { data: formRow } = await admin
      .from('forms')
      .select('id, name, job_type')
      .eq('job_type', workOrder.job_type)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let form: MobileForm | null = null
    let existingSubmission: { id: string; form_data: Record<string, unknown> } | null = null

    if (formRow) {
      // One nested-embed query pulls sections + fields + tables + rows together — the
      // form used to be loaded with a separate round trip per section and per table,
      // which for a 5-section form meant ~9 sequential DB calls before the page could render.
      type SectionEmbed = {
        id: string; title: string; order_index: number
        form_fields: MobileFormField[]
        form_tables: (MobileFormTable & { form_table_rows: MobileFormRow[] })[]
      }
      const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index

      const [{ data: secs, error: secsErr }, { data: sub }] = await Promise.all([
        admin.from('form_sections')
          .select('id, title, order_index, form_fields(*), form_tables(*, form_table_rows(*))')
          .eq('form_id', formRow.id)
          .order('order_index'),
        admin.from('form_submissions')
          .select('id, form_data')
          .eq('work_order_id', woId)
          .eq('form_id', formRow.id)
          .maybeSingle(),
      ])
      if (secsErr) console.error('getMobileWorkOrderWithForm sections:', secsErr.message)

      const sections: MobileFormSection[] = ((secs as unknown as SectionEmbed[]) || []).map(sec => ({
        id: sec.id,
        title: sec.title,
        order_index: sec.order_index,
        fields: (sec.form_fields || []).slice().sort(byOrder),
        tables: (sec.form_tables || []).slice().sort(byOrder).map(t => ({
          ...t,
          rows: (t.form_table_rows || []).slice().sort(byOrder),
        })),
      }))

      form = { id: formRow.id, name: formRow.name, job_type: formRow.job_type, sections }
      if (sub) existingSubmission = { id: sub.id, form_data: sub.form_data }
    }

    return { workOrder, form, existingSubmission, error: null }
  } catch (e: unknown) {
    return { workOrder: null, form: null, existingSubmission: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileWorkOrderDetailCore(admin: AdminClient, userId: string, woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { detail: null, error: 'Notification not found' }

    const [{ data: checkins }, { data: submission }, { data: closures }, { data: currentWotRows }] = await Promise.all([
      admin.from('work_order_checkins').select('checked_in_at').eq('work_order_id', woId).order('checked_in_at', { ascending: false }).limit(1),
      admin.from('form_submissions').select('id').eq('work_order_id', woId).limit(1),
      admin.from('work_order_daily_closures')
        .select('outcome, created_at, revisit_date, needs_reassignment, summary, pending_reason, materials_required, engineer_id')
        .eq('work_order_id', woId)
        .order('created_at', { ascending: false })
        .limit(1),
      admin.from('work_order_transformers').select('transformer_id').eq('work_order_id', woId),
    ])

    // "Previous visits" is history for the same equipment (serial number), not the
    // customer as a whole.
    const transformerIds = [...new Set((currentWotRows || []).map(r => r.transformer_id))]
    let previous: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[] = []
    if (transformerIds.length) {
      const { data: relatedWotRows } = await admin
        .from('work_order_transformers')
        .select('work_order_id')
        .in('transformer_id', transformerIds)
        .neq('work_order_id', woId)
      const relatedWoIds = [...new Set((relatedWotRows || []).map(r => r.work_order_id))]
      if (relatedWoIds.length) {
        const { data: relatedWos } = await admin
          .from('work_orders')
          .select('wo_number, job_type, scheduled_date, status')
          .in('id', relatedWoIds)
          .order('scheduled_date', { ascending: false })
          .limit(5)
        previous = relatedWos || []
      }
    }

    const lastCheckinAt = checkins?.[0]?.checked_in_at || null
    const closureRow = closures?.[0] || null

    let engineerName = 'Engineer'
    if (closureRow?.engineer_id) {
      const { data: closureEngineer } = await admin.from('profiles').select('first_name, last_name').eq('id', closureRow.engineer_id).maybeSingle()
      if (closureEngineer) engineerName = `${closureEngineer.first_name} ${closureEngineer.last_name}`
    }

    const latestClosure = closureRow ? {
      outcome: closureRow.outcome,
      created_at: closureRow.created_at,
      revisitDate: closureRow.revisit_date,
      needsReassignment: closureRow.needs_reassignment,
      engineerId: closureRow.engineer_id,
      engineerName,
      summary: closureRow.summary,
      pendingReason: closureRow.pending_reason,
      materialsRequired: closureRow.materials_required,
    } : null

    const checkedInToday = !!lastCheckinAt && new Date(lastCheckinAt).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
    const hasCheckedIn = checkedInToday && (!latestClosure || new Date(lastCheckinAt!) > new Date(latestClosure.created_at))

    return {
      detail: {
        workOrder,
        hasCheckedIn,
        lastCheckinAt,
        hasFormSubmission: !!submission?.length,
        latestClosure,
        handoverFromOtherEngineer: !!(latestClosure?.engineerId && latestClosure.engineerId !== userId),
        previousVisits: previous || [],
      },
      error: null,
    }
  } catch (e: unknown) {
    return { detail: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function submitCheckInCore(admin: AdminClient, userId: string, params: {
  workOrderId: string
  latitude: number | null
  longitude: number | null
  placeName: string | null
  photoBase64: string
  mimeType: string
  ext: string
}): Promise<{ error: string | null }> {
  try {
    touchHeartbeat(admin, userId)

    const existingWoResult = await withTimeout(
      admin.from('work_orders').select('status').eq('id', params.workOrderId).single(),
      8000
    )
    const existingWo = existingWoResult?.data
    if (existingWo?.status === 'needs_reassignment') {
      return { error: 'This notification is flagged for reassignment — an admin needs to assign a new engineer before it can be checked into again.' }
    }

    const base64 = params.photoBase64.split(',')[1] ?? params.photoBase64
    const buffer = Buffer.from(base64, 'base64')
    const path = `checkins/${params.workOrderId}-${Date.now()}.${params.ext}`

    let photoUrl: string | null = null
    const uploadResult = await withTimeout(
      admin.storage.from('assets').upload(path, buffer, { upsert: true, contentType: params.mimeType }),
      25000
    )
    if (uploadResult && !uploadResult.error) {
      photoUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
    } else if (!uploadResult) {
      console.error(`submitCheckIn: photo upload timed out for work order ${params.workOrderId} (path: ${path})`)
    } else {
      console.error(`submitCheckIn: photo upload failed for work order ${params.workOrderId} (path: ${path}):`, uploadResult.error.message)
    }

    const insResult = await withTimeout(
      admin.from('work_order_checkins').insert({
        work_order_id: params.workOrderId,
        engineer_id: userId,
        latitude: params.latitude,
        longitude: params.longitude,
        place_name: params.placeName,
        photo_url: photoUrl,
      }),
      8000
    )
    if (!insResult) return { error: 'Check-in is taking longer than expected — please check your connection and try again.' }
    if (insResult.error) return { error: insResult.error.message }

    if (existingWo && existingWo.status !== 'in_progress' && existingWo.status !== 'completed') {
      await withTimeout(
        admin.from('work_orders').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', params.workOrderId),
        8000
      )
    }

    // Checking in supersedes whatever daily status the engineer had (Available, On the
    // way, Travelling) — they've now actually reached the site.
    admin.from('profiles').update({
      engineer_status: 'reached',
      engineer_status_work_order_id: params.workOrderId,
      engineer_status_updated_at: new Date().toISOString(),
    }).eq('id', userId).then(() => {}, () => {})

    logActivity(admin, params.workOrderId, userId, 'Checked in at project').catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Builds the visit summary PDF + Word doc at closure time (not form-submit time) —
// pulls the job/customer/form structure plus whatever the engineer has saved so far
// in form_submissions, since the closure screen itself only has the day's outcome fields.
async function buildVisitDocs(
  admin: AdminClient,
  workOrderId: string,
  engineerName: string,
  clientName: string | null,
  engineerSignature: string | null,
  clientSignature: string | null
): Promise<{ pdfUrl: string | null; wordUrl: string | null }> {
  const woResult = await withTimeout(
    admin.from('work_orders').select('wo_number, job_type, customer_id').eq('id', workOrderId).single(),
    8000
  )
  const wo = woResult?.data
  if (!wo) return { pdfUrl: null, wordUrl: null }

  const dataResult = await withTimeout(
    Promise.all([
      admin.from('customers').select('name').eq('id', wo.customer_id).single(),
      admin.from('work_order_transformers').select('transformers(serial_number)').eq('work_order_id', workOrderId),
      admin.from('forms').select('id').eq('job_type', wo.job_type).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('form_submissions').select('form_data').eq('work_order_id', workOrderId).maybeSingle(),
    ]),
    8000
  )
  if (!dataResult) return { pdfUrl: null, wordUrl: null }
  const [{ data: customer }, { data: wotRows }, { data: formRow }, { data: submission }] = dataResult

  type WotRow = { transformers: { serial_number: string } | null }
  const serialNumbers = ((wotRows as unknown as WotRow[]) || []).map(r => r.transformers?.serial_number).filter(Boolean).join(', ')
  const formData = (submission?.form_data as { fields?: Record<string, string>; table_rows?: Record<string, { status: string; remarks: string }> }) || {}

  let sections: { title: string; fields: { id: string; label: string; field_type: string }[]; tables: { rows: { id: string; row_label: string; sno_label: string | null }[] }[] }[] = []
  if (formRow) {
    const secsResult = await withTimeout(
      admin.from('form_sections')
        .select('title, order_index, form_fields(id, label, field_type, order_index), form_tables(order_index, form_table_rows(id, row_label, sno_label, order_index))')
        .eq('form_id', formRow.id)
        .order('order_index'),
      8000
    )
    const secs = secsResult?.data

    type SectionEmbed = {
      title: string; order_index: number
      form_fields: { id: string; label: string; field_type: string; order_index: number }[]
      form_tables: { order_index: number; form_table_rows: { id: string; row_label: string; sno_label: string | null; order_index: number }[] }[]
    }
    const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index
    sections = ((secs as unknown as SectionEmbed[]) || []).slice().sort(byOrder).map(s => ({
      title: s.title,
      fields: (s.form_fields || []).slice().sort(byOrder),
      tables: (s.form_tables || []).slice().sort(byOrder).map(t => ({ rows: (t.form_table_rows || []).slice().sort(byOrder) })),
    }))
  }

  const docParams = {
    woNumber: wo.wo_number,
    jobType: wo.job_type,
    customerName: customer?.name || '',
    serialNumbers,
    engineerName,
    clientName,
    visitType: 'final' as const,
    sections,
    fieldValues: formData.fields || {},
    rowValues: formData.table_rows || {},
    engineerSignature,
    clientSignature,
  }
  const stamp = Date.now()

  let pdfUrl: string | null = null
  try {
    const pdfBuffer = await generateVisitPdf(docParams)
    const path = `visit-pdfs/${workOrderId}-${stamp}.pdf`
    const upResult = await withTimeout(
      admin.storage.from('assets').upload(path, pdfBuffer, { upsert: true, contentType: 'application/pdf' }),
      12000
    )
    if (upResult && !upResult.error) pdfUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
  } catch (e) {
    console.error('buildVisitDocs (pdf) failed:', e)
  }

  let wordUrl: string | null = null
  try {
    const wordBuffer = await generateVisitWord(docParams)
    const path = `visit-docs/${workOrderId}-${stamp}.docx`
    const upResult = await withTimeout(
      admin.storage.from('assets').upload(path, wordBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      12000
    )
    if (upResult && !upResult.error) wordUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
  } catch (e) {
    console.error('buildVisitDocs (word) failed:', e)
  }

  return { pdfUrl, wordUrl }
}

export async function submitDailyClosureCore(admin: AdminClient, userId: string, params: {
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
  // Self-reported completion from the "still checked in" dashboard prompt when the
  // engineer says they're no longer at the site — client signature is skipped (they're
  // not there to get one), everything else (engineer signature, PDF/Word, activity log)
  // still happens as normal, plus a flagged entry for the manager's Dashboard card.
  offSite?: boolean
}): Promise<{ error: string | null }> {
  try {
    // A follow-up date is always required for a pending visit now — it's the only
    // signal for "when should someone check this again", since the notification no
    // longer gets its own distinct Pending status (see below).
    if (params.outcome === 'pending' && !params.revisitDate) {
      return { error: 'A follow-up date is required' }
    }

    touchHeartbeat(admin, userId)

    const actorResult = await withTimeout(
      admin.from('profiles').select('first_name, last_name').eq('id', userId).single(),
      8000
    )
    const actor = actorResult?.data
    const engineerName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'

    // Only a completed (final) visit generates a PDF + Word doc and gets flagged as
    // sent to SAP — "sent to SAP" is mocked, there is no real SAP integration, but
    // both documents are real.
    let pdfUrl: string | null = null
    let wordUrl: string | null = null
    let sentToSap = false
    let sentToSapAt: string | null = null
    if (params.outcome === 'completed') {
      const result = await buildVisitDocs(admin, params.workOrderId, engineerName, params.clientName, params.engineerSignature, params.clientSignature)
      pdfUrl = result.pdfUrl
      wordUrl = result.wordUrl
      sentToSap = !!pdfUrl
      sentToSapAt = pdfUrl ? new Date().toISOString() : null
    }

    const closureResult = await withTimeout(
      admin.from('work_order_daily_closures').insert({
        work_order_id: params.workOrderId,
        engineer_id: userId,
        outcome: params.outcome,
        summary: params.summary,
        pending_reason: params.pendingReason,
        materials_required: params.materialsRequired,
        revisit_date: params.revisitDate,
        needs_reassignment: params.outcome === 'pending' ? params.needsReassignment : false,
        engineer_signature: params.engineerSignature,
        client_name: params.clientName,
        client_signature: params.clientSignature,
        pdf_url: pdfUrl,
        word_url: wordUrl,
        sent_to_sap: sentToSap,
        sent_to_sap_at: sentToSapAt,
      }),
      8000
    )
    if (!closureResult) return { error: 'Saving is taking longer than expected — please check your connection and try again.' }
    if (closureResult.error) return { error: closureResult.error.message }

    await withTimeout(
      admin.from('work_order_visits').insert({
        work_order_id: params.workOrderId,
        engineer_id: userId,
        visit_type: params.outcome === 'completed' ? 'final' : 'followup',
        form_data: {},
        engineer_signature: params.engineerSignature,
        client_name: params.clientName,
        client_signature: params.clientSignature,
        pdf_url: pdfUrl,
        word_url: wordUrl,
        sent_to_sap: sentToSap,
        sent_to_sap_at: sentToSapAt,
      }),
      8000
    )

    // A visit that can't be finished in a day keeps the notification "in_progress" —
    // 'pending' is no longer a distinct status — with scheduled_date carrying the
    // follow-up date so "what's next for this job" stays in one consistent field
    // across every status, not a separate untouched original-assignment date.
    const newStatus = params.outcome === 'pending'
      ? (params.needsReassignment ? 'needs_reassignment' : 'in_progress')
      : params.outcome
    await withTimeout(
      admin.from('work_orders').update({
        status: newStatus,
        ...(params.outcome === 'pending' ? { scheduled_date: params.revisitDate } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', params.workOrderId),
      8000
    )

    // Marking the job completed also flips the engineer's live status from
    // "Reached — <project>" to "Completed — <project>" (same fire-and-forget
    // pattern as submitCheckIn's "reached" update below) — otherwise status stayed
    // frozen at "Reached" indefinitely after the visit was actually finished.
    if (params.outcome === 'completed') {
      admin.from('profiles').update({
        engineer_status: 'completed',
        engineer_status_work_order_id: params.workOrderId,
        engineer_status_updated_at: new Date().toISOString(),
      }).eq('id', userId).then(() => {}, () => {})
    }

    const activityMsg = params.outcome === 'completed'
      ? `Marked notification completed${sentToSap ? ' — visit PDF sent to SAP' : ''}`
      : params.needsReassignment
        ? 'Marked pending — needs reassignment to a different engineer'
        : `Marked in progress — follow-up on ${new Date(params.revisitDate!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    logActivity(admin, params.workOrderId, userId, activityMsg).catch(() => {})

    if (params.offSite || params.needsReassignment) {
      const { data: wo } = await admin.from('work_orders').select('wo_number').eq('id', params.workOrderId).maybeSingle()

      if (params.offSite) {
        logSystemActivity(admin, {
          actorId: userId, actorName: engineerName,
          action: `Marked ${wo?.wo_number || 'a notification'} completed without being on-site`,
          entityType: 'off_site_status_update', entityId: params.workOrderId,
        }).catch(() => {})
      }

      if (params.needsReassignment) {
        notifyUsers(admin, [{ role: 'Super Admin' }, { role: 'Head of Service' }, { role: 'Service Manager' }], {
          type: 'work_order_needs_reassignment',
          title: `Reassignment needed: ${wo?.wo_number || 'a notification'}`,
          body: `${engineerName} marked this notification as needing reassignment to a different engineer.`,
          entityType: 'work_order', entityId: params.workOrderId, linkPath: `/work-orders/${params.workOrderId}`,
        }).catch(() => {})
      }
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Shared by the PWA's /api/mobile/submit-form route and (once Phase 3 builds the RN
// form screen) its REST equivalent. Upserts the form submission exactly as before,
// then — per explicit product decision, 2026-08-11 — if the form has both a filled
// "Engineer signature" and "Customer signature" field, that alone is treated as the
// visit being done: no separate closure step. This reuses submitDailyClosureCore's
// existing "completed" branch (status transition, PDF/Word generation, sent_to_sap)
// rather than duplicating it, with a generic summary text since this path doesn't
// collect a separate work-summary field, and the customer's already-on-file contact
// name (not a form field) is used for the visit doc's client name.
export async function submitJobFormCore(admin: AdminClient, userId: string, params: {
  workOrderId: string
  formId: string
  formData: { fields: Record<string, string>; table_rows: Record<string, unknown> }
}): Promise<{ error: string | null; completed: boolean }> {
  try {
    const { error: subErr } = await admin.from('form_submissions').upsert({
      work_order_id: params.workOrderId,
      form_id: params.formId,
      submitted_by: userId,
      form_data: params.formData,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'work_order_id,form_id' })
    if (subErr) return { error: subErr.message, completed: false }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    await admin.from('work_order_activity').insert({
      work_order_id: params.workOrderId,
      action: `Form submitted by ${actorName}`,
      actor_name: actorName,
    })

    let completed = false
    const { data: wo } = await admin.from('work_orders').select('status').eq('id', params.workOrderId).maybeSingle()
    if (wo && wo.status !== 'completed') {
      const { data: secs } = await admin
        .from('form_sections')
        .select('form_fields(id, label, field_type)')
        .eq('form_id', params.formId)

      type SectionEmbed = { form_fields: { id: string; label: string; field_type: string }[] }
      const allFields = ((secs as unknown as SectionEmbed[]) || []).flatMap(s => s.form_fields || [])
      const engineerField = allFields.find(f => f.field_type === 'signature' && ENGINEER_SIGNATURE_LABEL.test(f.label))
      const customerField = allFields.find(f => f.field_type === 'signature' && CUSTOMER_SIGNATURE_LABEL.test(f.label))
      const engineerSignature = engineerField ? params.formData.fields[engineerField.id] : null
      const clientSignature = customerField ? params.formData.fields[customerField.id] : null

      if (engineerSignature && clientSignature) {
        const workOrder = await fetchSingleWorkOrder(admin, params.workOrderId)
        const clientName = workOrder?.customer_contact || workOrder?.customer_name || ''
        const closureResult = await submitDailyClosureCore(admin, userId, {
          workOrderId: params.workOrderId,
          outcome: 'completed',
          summary: 'Completed via job form',
          pendingReason: null,
          materialsRequired: null,
          revisitDate: null,
          needsReassignment: false,
          engineerSignature,
          clientName,
          clientSignature,
          offSite: false,
        })
        if (!closureResult.error) completed = true
      }
    }

    return { error: null, completed }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), completed: false }
  }
}
