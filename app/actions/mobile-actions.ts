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

async function fetchEngineerWorkOrders(
  admin: ReturnType<typeof adminClient>,
  userId: string
): Promise<MobileWorkOrder[]> {
  const { data: wos } = await admin
    .from('work_orders')
    .select('*')
    .eq('engineer_id', userId)
    .order('scheduled_date', { ascending: true })

  if (!wos?.length) return []

  const woIds = wos.map((w: { id: string }) => w.id)
  const customerIds = [...new Set(wos.map((w: { customer_id: string }) => w.customer_id))]

  const [{ data: wotRows }, { data: customers }] = await Promise.all([
    admin.from('work_order_transformers')
      .select('work_order_id, transformer_id, transformers(serial_number, customer_sites(site_name))')
      .in('work_order_id', woIds),
    admin.from('customers').select('id, name').in('id', customerIds),
  ])

  const custMap: Record<string, string> = {}
  customers?.forEach((c: { id: string; name: string }) => { custMap[c.id] = c.name })

  type WotRow = { work_order_id: string; transformers: { serial_number: string; customer_sites: { site_name: string } | null } | null }
  const wotByWo: Record<string, WotRow[]> = {}
  ;(wotRows as unknown as WotRow[])?.forEach((r: WotRow) => {
    if (!wotByWo[r.work_order_id]) wotByWo[r.work_order_id] = []
    wotByWo[r.work_order_id].push(r)
  })

  return wos.map((w: { id: string; wo_number: string; job_type: string; status: string; scheduled_date: string | null; notes: string | null; customer_id: string }) => {
    const rows = wotByWo[w.id] || []
    return {
      id: w.id,
      wo_number: w.wo_number,
      job_type: w.job_type,
      status: w.status,
      scheduled_date: w.scheduled_date,
      notes: w.notes,
      customer_name: custMap[w.customer_id] || '',
      serial_numbers: rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[],
      site_name: rows[0]?.transformers?.customer_sites?.site_name || null,
    }
  })
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
  const { data: wo, error: woErr } = await admin.from('work_orders').select('*').eq('id', woId).single()
  if (woErr || !wo) return null

  const [{ data: wotRows }, { data: customer }] = await Promise.all([
    admin.from('work_order_transformers')
      .select('transformer_id, transformers(serial_number, customer_sites(site_name, site_address))')
      .eq('work_order_id', woId),
    admin.from('customers').select('name, contact_person, phone').eq('id', wo.customer_id).single(),
  ])

  type WotRow = { transformers: { serial_number: string; customer_sites: { site_name: string; site_address: string } | null } | null }
  const rows = (wotRows as unknown as WotRow[]) || []

  return {
    id: wo.id,
    wo_number: wo.wo_number,
    job_type: wo.job_type,
    status: wo.status,
    scheduled_date: wo.scheduled_date,
    notes: wo.notes,
    customer_id: wo.customer_id,
    customer_name: customer?.name || '',
    customer_contact: customer?.contact_person || null,
    customer_phone: customer?.phone || null,
    site_address: rows[0]?.transformers?.customer_sites?.site_address || null,
    serial_numbers: rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[],
    site_name: rows[0]?.transformers?.customer_sites?.site_name || null,
  }
}

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
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
      // Load sections
      const { data: secs } = await admin
        .from('form_sections')
        .select('*')
        .eq('form_id', formRow.id)
        .order('order_index')

      const sections: MobileFormSection[] = []
      for (const sec of (secs || [])) {
        const [{ data: fields }, { data: tables }] = await Promise.all([
          admin.from('form_fields').select('*').eq('section_id', sec.id).order('order_index'),
          admin.from('form_tables').select('*').eq('section_id', sec.id).order('order_index'),
        ])

        const tablesWithRows: MobileFormTable[] = []
        for (const t of (tables || [])) {
          const { data: tRows } = await admin
            .from('form_table_rows')
            .select('*')
            .eq('table_id', t.id)
            .order('order_index')
          tablesWithRows.push({ ...t, rows: tRows || [] })
        }

        sections.push({
          id: sec.id,
          title: sec.title,
          order_index: sec.order_index,
          fields: fields || [],
          tables: tablesWithRows,
        })
      }

      form = { id: formRow.id, name: formRow.name, job_type: formRow.job_type, sections }

      // Check for existing submission
      const { data: sub } = await admin
        .from('form_submissions')
        .select('id, form_data')
        .eq('work_order_id', woId)
        .eq('form_id', formRow.id)
        .maybeSingle()
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
  photoBase64: string
  mimeType: string
  ext: string
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
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
