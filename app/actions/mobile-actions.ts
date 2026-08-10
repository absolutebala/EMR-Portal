'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { generateVisitPdf } from '@/lib/mobile/generateVisitPdf'
import { generateVisitWord } from '@/lib/mobile/generateVisitWord'
import { logActivity as logSystemActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import {
  adminClient, withTimeout, touchHeartbeat, fetchSingleWorkOrder,
  logActivity, reverseGeocodeCore,
  type MobileWorkOrder, type MobileWorkOrderWithCustomer, type MobileDashboardStats,
  type OverdueFollowUp, type EngineerStatusValue, type EngineerStatusPrompt,
  type NotStartedNotice, type MobileWorkOrderDetail,
} from '@/lib/mobile/core/shared'
import {
  getMobileWorkOrdersCore, getMobileDashboardDataCore, getOverdueFollowUpsCore, rescheduleFollowUpCore,
  getMobileJobsListCore, recordLastSeenCore, logLocationPingIssueCore, checkOpenVisitFollowUpCore,
  getEngineerStatusPromptCore, setEngineerStatusCore, checkNotStartedFollowUpCore,
} from '@/lib/mobile/core/dashboard'
import { getMobileWorkOrderBasicCore, getMobileWorkOrderDetailCore } from '@/lib/mobile/core/workOrders'
// NOTE: MobileWorkOrder, MobileWorkOrderWithCustomer, MobileDashboardStats,
// OverdueFollowUp, EngineerStatusValue, AssignableSite, EngineerStatusPrompt,
// NotStartedNotice, MobileWorkOrderDetail now live in lib/mobile/core/shared.ts —
// import them from there directly, not from this file. A `'use server'` module's
// server-action compiler tries to wire every top-level export (including type-only
// re-exports) into its action manifest, and type-only exports get erased at compile
// time, which breaks the build — so these types can no longer be re-exported here.

export interface MobileFormRow {
  id: string
  table_id: string
  parent_row_id: string | null
  row_label: string
  sno_label: string | null
  order_index: number
}

export interface MobileFormTable {
  id: string
  section_id: string
  status_type: string
  has_subrows: boolean
  col1_label: string | null
  col2_label: string | null
  order_index: number
  rows: MobileFormRow[]
}

export interface MobileFormField {
  id: string
  section_id: string
  label: string
  field_type: string
  is_required: boolean
  prefill_from_job: boolean
  read_only_on_mobile: boolean
  placeholder: string | null
  help_text: string | null
  order_index: number
}

export interface MobileFormSection {
  id: string
  title: string
  order_index: number
  fields: MobileFormField[]
  tables: MobileFormTable[]
}

export interface MobileForm {
  id: string
  name: string
  job_type: string
  sections: MobileFormSection[]
}

// ── Thin 'use server' wrappers: auth resolution only. All business logic lives in
// lib/mobile/core/*, shared with the React Native REST routes (app/api/mobile/v1/*)
// so nothing is duplicated between the PWA and the native app. ──────────────────────

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }
  return getMobileWorkOrdersCore(adminClient(), user.id)
}

export async function getMobileDashboardData(): Promise<{
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  error: string | null
}> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { stats: { assigned: 0, inProgress: 0, needsReassignment: 0, completed: 0 }, recentJobs: [], engineer: null, error: 'Not authenticated' }
  return getMobileDashboardDataCore(adminClient(), user.id)
}

export async function getOverdueFollowUps(): Promise<{ followUps: OverdueFollowUp[]; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { followUps: [], error: 'Not authenticated' }
  return getOverdueFollowUpsCore(adminClient(), user.id)
}

export async function rescheduleFollowUp(workOrderId: string, newDate: string, offSite?: boolean): Promise<{ error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return rescheduleFollowUpCore(adminClient(), user.id, workOrderId, newDate, offSite)
}

export async function getMobileJobsList(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }
  return getMobileJobsListCore(adminClient(), user.id)
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string | null }> {
  return reverseGeocodeCore(lat, lng)
}

export async function recordLastSeen(lat: number, lng: number): Promise<{ error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return recordLastSeenCore(adminClient(), user.id, lat, lng)
}

export async function logLocationPingIssue(reason: string): Promise<void> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  logLocationPingIssueCore(user?.id ?? null, reason)
}

export async function checkOpenVisitFollowUp(): Promise<{ followUp: OverdueFollowUp | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { followUp: null, error: 'Not authenticated' }
  return checkOpenVisitFollowUpCore(adminClient(), user.id)
}

export async function getEngineerStatusPrompt(): Promise<{ prompt: EngineerStatusPrompt | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { prompt: null, error: 'Not authenticated' }
  return getEngineerStatusPromptCore(adminClient(), user.id)
}

export async function setEngineerStatus(
  status: EngineerStatusValue,
  workOrderId?: string | null,
  startByTime?: string | null,
  currentLat?: number | null,
  currentLng?: number | null
): Promise<{ error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return setEngineerStatusCore(adminClient(), user.id, status, workOrderId, startByTime, currentLat, currentLng)
}

export async function checkNotStartedFollowUp(currentLat: number, currentLng: number): Promise<{ notice: NotStartedNotice | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { notice: null, error: 'Not authenticated' }
  return checkNotStartedFollowUpCore(adminClient(), user.id, currentLat, currentLng)
}

export async function getMobileWorkOrderBasic(woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { workOrder: null, error: 'Not authenticated' }
  return getMobileWorkOrderBasicCore(adminClient(), user.id, woId)
}

export async function getMobileWorkOrderDetail(woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { detail: null, error: 'Not authenticated' }
  return getMobileWorkOrderDetailCore(adminClient(), user.id, woId)
}

// ── Not yet extracted (Phase 2/3 of the React Native migration) — still full
// server-action bodies, but now sourcing shared helpers from lib/mobile/core/shared
// instead of local duplicates. ───────────────────────────────────────────────────────

export async function getMobileWorkOrderWithForm(woId: string): Promise<{
  workOrder: MobileWorkOrderWithCustomer | null
  form: MobileForm | null
  existingSubmission: { id: string; form_data: Record<string, unknown> } | null
  error: string | null
}> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { workOrder: null, form: null, existingSubmission: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)

    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, form: null, existingSubmission: null, error: 'Notification not found' }

    const { data: engineerProfile } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
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

export async function submitCheckIn(params: {
  workOrderId: string
  latitude: number | null
  longitude: number | null
  placeName: string | null
  photoBase64: string
  mimeType: string
  ext: string
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)

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
        engineer_id: user.id,
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
    }).eq('id', user.id).then(() => {}, () => {})

    logActivity(admin, params.workOrderId, user.id, 'Checked in at project').catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Builds the visit summary PDF + Word doc at closure time (not form-submit time) —
// pulls the job/customer/form structure plus whatever the engineer has saved so far
// in form_submissions, since the closure screen itself only has the day's outcome fields.
async function buildVisitDocs(
  admin: ReturnType<typeof adminClient>,
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

export async function submitDailyClosure(params: {
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
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    // A follow-up date is always required for a pending visit now — it's the only
    // signal for "when should someone check this again", since the notification no
    // longer gets its own distinct Pending status (see below).
    if (params.outcome === 'pending' && !params.revisitDate) {
      return { error: 'A follow-up date is required' }
    }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)

    const actorResult = await withTimeout(
      admin.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
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
        engineer_id: user.id,
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
        engineer_id: user.id,
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
      }).eq('id', user.id).then(() => {}, () => {})
    }

    const activityMsg = params.outcome === 'completed'
      ? `Marked notification completed${sentToSap ? ' — visit PDF sent to SAP' : ''}`
      : params.needsReassignment
        ? 'Marked pending — needs reassignment to a different engineer'
        : `Marked in progress — follow-up on ${new Date(params.revisitDate!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    logActivity(admin, params.workOrderId, user.id, activityMsg).catch(() => {})

    if (params.offSite || params.needsReassignment) {
      const { data: wo } = await admin.from('work_orders').select('wo_number').eq('id', params.workOrderId).maybeSingle()

      if (params.offSite) {
        logSystemActivity(admin, {
          actorId: user.id, actorName: engineerName,
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
