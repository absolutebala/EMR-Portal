'use server'

import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import {
  adminClient, touchHeartbeat, fetchSingleWorkOrder, reverseGeocodeCore,
  type MobileWorkOrder, type MobileWorkOrderWithCustomer, type MobileDashboardStats,
  type OverdueFollowUp, type EngineerStatusValue, type EngineerStatusPrompt,
  type NotStartedNotice, type MobileWorkOrderDetail,
} from '@/lib/mobile/core/shared'
import {
  getMobileWorkOrdersCore, getMobileDashboardDataCore, getOverdueFollowUpsCore, rescheduleFollowUpCore,
  getMobileJobsListCore, recordLastSeenCore, logLocationPingIssueCore, checkOpenVisitFollowUpCore,
  getEngineerStatusPromptCore, setEngineerStatusCore, checkNotStartedFollowUpCore,
} from '@/lib/mobile/core/dashboard'
import {
  getMobileWorkOrderBasicCore, getMobileWorkOrderDetailCore, submitCheckInCore, submitDailyClosureCore,
} from '@/lib/mobile/core/workOrders'
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
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return submitCheckInCore(adminClient(), user.id, params)
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
  const sb = await serverClient()
  const user = await getAuthedUser(sb)
  if (!user) return { error: 'Not authenticated' }
  return submitDailyClosureCore(adminClient(), user.id, params)
}
