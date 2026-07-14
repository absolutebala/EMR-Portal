'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Storage/network calls have no built-in timeout — a stalled request would otherwise
// hang the whole server action (and the caller's UI) indefinitely.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

// Fire-and-forget presence heartbeat — called from the mobile app's main data-fetch
// entry points so desktop can derive an "Available" vs "Off duty" status from recent
// app activity, without needing continuous background GPS (not reliable from a PWA).
function touchHeartbeat(admin: ReturnType<typeof adminClient>, userId: string) {
  admin.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId).then(
    () => {},
    () => {}
  )
}

export interface MobileWorkOrder {
  id: string
  wo_number: string
  job_type: string
  status: string
  scheduled_date: string | null
  notes: string | null
  customer_name: string
  serial_numbers: string[]
  site_name: string | null
}

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

type WorkOrderEmbed = {
  id: string; wo_number: string; job_type: string; status: string
  scheduled_date: string | null; notes: string | null; customer_id: string
  customers: { name: string; contact_person: string; phone: string } | null
  work_order_transformers: { transformers: { serial_number: string; customer_sites: { site_name: string; site_address: string } | null } | null }[]
}

const WORK_ORDER_SELECT = `
  id, wo_number, job_type, status, scheduled_date, notes, customer_id,
  customers ( name, contact_person, phone ),
  work_order_transformers ( transformers ( serial_number, customer_sites ( site_name, site_address ) ) )
`

function mapWorkOrderEmbed(w: WorkOrderEmbed): MobileWorkOrder {
  const rows = w.work_order_transformers || []
  return {
    id: w.id,
    wo_number: w.wo_number,
    job_type: w.job_type,
    status: w.status,
    scheduled_date: w.scheduled_date,
    notes: w.notes,
    customer_name: w.customers?.name || '',
    serial_numbers: rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[],
    site_name: rows[0]?.transformers?.customer_sites?.site_name || null,
  }
}

// Single embedded query (work orders + customer + transformers + sites) instead of
// a main query followed by separate round trips for each related table — those extra
// round trips were the main reason mobile pages felt slow.
async function fetchEngineerWorkOrders(
  admin: ReturnType<typeof adminClient>,
  userId: string
): Promise<MobileWorkOrder[]> {
  const { data: wos, error } = await admin
    .from('work_orders')
    .select(WORK_ORDER_SELECT)
    .eq('engineer_id', userId)
    .order('scheduled_date', { ascending: true })

  if (error) console.error('fetchEngineerWorkOrders:', error.message)
  return ((wos as unknown as WorkOrderEmbed[]) || []).map(mapWorkOrderEmbed)
}

async function getEngineerName(admin: ReturnType<typeof adminClient>, userId: string): Promise<{ name: string } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single()
  return profile ? { name: `${profile.first_name} ${profile.last_name}` } : null
}

export interface MobileWorkOrderWithCustomer extends MobileWorkOrder {
  customer_id: string
  customer_contact: string | null
  customer_phone: string | null
  site_address: string | null
}

async function fetchSingleWorkOrder(
  admin: ReturnType<typeof adminClient>,
  woId: string
): Promise<MobileWorkOrderWithCustomer | null> {
  const { data: wo, error } = await admin
    .from('work_orders')
    .select(WORK_ORDER_SELECT)
    .eq('id', woId)
    .single()
  if (error) console.error('fetchSingleWorkOrder:', error.message)
  if (error || !wo) return null

  const w = wo as unknown as WorkOrderEmbed
  const rows = w.work_order_transformers || []

  return {
    ...mapWorkOrderEmbed(w),
    customer_id: w.customer_id,
    customer_contact: w.customers?.contact_person || null,
    customer_phone: w.customers?.phone || null,
    site_address: rows[0]?.transformers?.customer_sites?.site_address || null,
  }
}

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, user.id),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    return { workOrders: workOrders.filter(w => w.status !== 'completed'), engineer, error: null }
  } catch (e: unknown) {
    return { workOrders: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface MobileDashboardStats {
  assigned: number
  inProgress: number
  pending: number
  completed: number
}

export async function getMobileDashboardData(): Promise<{
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  error: string | null
}> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { stats: { assigned: 0, inProgress: 0, pending: 0, completed: 0 }, recentJobs: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, user.id),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    const stats: MobileDashboardStats = {
      assigned: workOrders.filter(w => w.status === 'assigned' || w.status === 'unassigned').length,
      inProgress: workOrders.filter(w => w.status === 'in_progress').length,
      pending: workOrders.filter(w => w.status === 'pending').length,
      completed: workOrders.filter(w => w.status === 'completed').length,
    }

    const recentJobs = workOrders.filter(w => w.status !== 'completed').slice(0, 3)

    return { stats, recentJobs, engineer, error: null }
  } catch (e: unknown) {
    return { stats: { assigned: 0, inProgress: 0, pending: 0, completed: 0 }, recentJobs: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileJobsList(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, user.id),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    return { workOrders, engineer, error: null }
  } catch (e: unknown) {
    return { workOrders: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileWorkOrderWithForm(woId: string): Promise<{
  workOrder: MobileWorkOrder | null
  form: MobileForm | null
  existingSubmission: { id: string; form_data: Record<string, unknown> } | null
  error: string | null
}> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrder: null, form: null, existingSubmission: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)

    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, form: null, existingSubmission: null, error: 'Work order not found' }

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

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string | null }> {
  try {
    const res = await withTimeout(
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
        { headers: { 'User-Agent': 'EMR-Portal-Mobile/1.0 (field service check-in)' } }
      ),
      6000
    )
    if (!res || !res.ok) return { label: null }
    const data = await res.json()
    const addr: Record<string, string> = data.address || {}
    const locality = addr.suburb || addr.neighbourhood || addr.town || addr.village || addr.city_district
    const city = addr.city || addr.town || addr.state_district
    const parts = [locality, city].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
    return { label: parts.length ? parts.join(', ') : (data.display_name?.split(',').slice(0, 2).join(',').trim() || null) }
  } catch {
    return { label: null }
  }
}

async function logActivity(admin: ReturnType<typeof adminClient>, woId: string, userId: string, action: string) {
  const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).single()
  const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
  await admin.from('work_order_activity').insert({
    work_order_id: woId,
    action: `${action} by ${actorName}`,
    actor_name: actorName,
  })
}

// For screens (check-in, closure) that only need the work order + customer info,
// not the full hub detail (checkin history, closures, previous visits) — no reason
// to pay for those extra queries on a page that never renders them.
export async function getMobileWorkOrderBasic(woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrder: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, error: 'Work order not found' }
    return { workOrder, error: null }
  } catch (e: unknown) {
    return { workOrder: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface MobileWorkOrderDetail {
  workOrder: MobileWorkOrderWithCustomer
  hasCheckedIn: boolean
  lastCheckinAt: string | null
  hasFormSubmission: boolean
  latestClosure: { outcome: string; created_at: string } | null
  previousVisits: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[]
}

export async function getMobileWorkOrderDetail(woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { detail: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { detail: null, error: 'Work order not found' }

    const [{ data: checkins }, { data: submission }, { data: closures }, { data: previous }] = await Promise.all([
      admin.from('work_order_checkins').select('checked_in_at').eq('work_order_id', woId).order('checked_in_at', { ascending: false }).limit(1),
      admin.from('form_submissions').select('id').eq('work_order_id', woId).limit(1),
      admin.from('work_order_daily_closures').select('outcome, created_at').eq('work_order_id', woId).order('created_at', { ascending: false }).limit(1),
      admin.from('work_orders')
        .select('wo_number, job_type, scheduled_date, status')
        .eq('customer_id', workOrder.customer_id)
        .neq('id', woId)
        .order('scheduled_date', { ascending: false })
        .limit(5),
    ])

    return {
      detail: {
        workOrder,
        hasCheckedIn: !!checkins?.length,
        lastCheckinAt: checkins?.[0]?.checked_in_at || null,
        hasFormSubmission: !!submission?.length,
        latestClosure: closures?.[0] || null,
        previousVisits: previous || [],
      },
      error: null,
    }
  } catch (e: unknown) {
    return { detail: null, error: e instanceof Error ? e.message : String(e) }
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
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const base64 = params.photoBase64.split(',')[1] ?? params.photoBase64
    const buffer = Buffer.from(base64, 'base64')
    const path = `checkins/${params.workOrderId}-${Date.now()}.${params.ext}`

    let photoUrl: string | null = null
    const uploadResult = await withTimeout(
      admin.storage.from('assets').upload(path, buffer, { upsert: true, contentType: params.mimeType }),
      12000
    )
    if (uploadResult && !uploadResult.error) {
      photoUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
    }

    const { error: insErr } = await admin.from('work_order_checkins').insert({
      work_order_id: params.workOrderId,
      engineer_id: user.id,
      latitude: params.latitude,
      longitude: params.longitude,
      place_name: params.placeName,
      photo_url: photoUrl,
    })
    if (insErr) return { error: insErr.message }

    const { data: wo } = await admin.from('work_orders').select('status').eq('id', params.workOrderId).single()
    if (wo && (wo.status === 'assigned' || wo.status === 'unassigned')) {
      await admin.from('work_orders').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', params.workOrderId)
    }

    await logActivity(admin, params.workOrderId, user.id, 'Checked in at site')

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function submitDailyClosure(params: {
  workOrderId: string
  outcome: 'completed' | 'pending'
  summary: string
  pendingReason: string | null
  materialsRequired: string | null
  revisitDate: string | null
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)

    const { error: insErr } = await admin.from('work_order_daily_closures').insert({
      work_order_id: params.workOrderId,
      engineer_id: user.id,
      outcome: params.outcome,
      summary: params.summary,
      pending_reason: params.pendingReason,
      materials_required: params.materialsRequired,
      revisit_date: params.revisitDate,
    })
    if (insErr) return { error: insErr.message }

    await admin.from('work_orders').update({
      status: params.outcome,
      updated_at: new Date().toISOString(),
    }).eq('id', params.workOrderId)

    await logActivity(
      admin, params.workOrderId, user.id,
      params.outcome === 'completed' ? 'Marked work order completed' : 'Marked work order pending'
    )

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
