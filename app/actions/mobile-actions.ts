'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { generateVisitPdf } from '@/lib/mobile/generateVisitPdf'
import { generateVisitWord } from '@/lib/mobile/generateVisitWord'
import { logActivity as logSystemActivity } from '@/lib/activity-log'
import { extractPlaceLabel } from '@/lib/geocode'

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
// entry points so the desktop Field Engineers page has a general "recently active"
// signal, independent of the explicit engineer_status the engineer sets themselves.
function touchHeartbeat(admin: ReturnType<typeof adminClient>, userId: string) {
  admin.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId).then(
    () => {},
    () => {}
  )
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// The engineer's current location for "distance to site" purposes — the passive
// app-open ping if we have one, else their most recent job check-in as a fallback.
// Never throws — this is a distance-display nicety, not something that should be
// able to take down the whole work-order listing it's called alongside via
// Promise.all (which fails the entire batch if any one part rejects).
async function getEngineerLocation(admin: ReturnType<typeof adminClient>, userId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data: profile } = await admin.from('profiles').select('last_seen_lat, last_seen_lng').eq('id', userId).maybeSingle()
    if (profile?.last_seen_lat != null && profile?.last_seen_lng != null) return { lat: profile.last_seen_lat, lng: profile.last_seen_lng }

    const { data: checkin } = await admin
      .from('work_order_checkins')
      .select('latitude, longitude')
      .eq('engineer_id', userId)
      .order('checked_in_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (checkin?.latitude != null && checkin?.longitude != null) return { lat: checkin.latitude, lng: checkin.longitude }
    return null
  } catch (e) {
    console.error('getEngineerLocation failed:', e)
    return null
  }
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
  // Approximate straight-line distance from the engineer's current known location
  // (last-seen ping, falling back to last check-in) to this job's site. Null when
  // either location isn't known/geocoded yet.
  distanceKm: number | null
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
  work_order_transformers: { transformers: { serial_number: string; rating: string | null; manufacturer: string | null; customer_sites: { id: string; site_name: string; site_address: string } | null } | null }[]
}

const WORK_ORDER_SELECT = `
  id, wo_number, job_type, status, scheduled_date, notes, customer_id,
  customers ( name, contact_person, phone ),
  work_order_transformers ( transformers ( serial_number, rating, manufacturer, customer_sites ( id, site_name, site_address ) ) )
`

// Site coordinates are looked up via a separate flat query (like getSiteCoordinates()
// in get-work-orders.ts already does), not embedded into WORK_ORDER_SELECT above —
// customer_sites.latitude/longitude inside that 3-levels-deep nested embed
// (work_orders → work_order_transformers → transformers → customer_sites) failed in
// production with "column customer_sites_N.latitude does not exist", even though the
// same columns work fine in a flat, non-embedded query against the same table.
function mapWorkOrderEmbed(w: WorkOrderEmbed, engineerLoc: { lat: number; lng: number } | null, siteCoordsById: Record<string, { lat: number; lng: number }>): MobileWorkOrder {
  const rows = w.work_order_transformers || []
  const site = rows[0]?.transformers?.customer_sites
  const siteCoords = site?.id ? siteCoordsById[site.id] : undefined
  const distanceKm = engineerLoc && siteCoords
    ? haversineKm(engineerLoc.lat, engineerLoc.lng, siteCoords.lat, siteCoords.lng)
    : null
  return {
    id: w.id,
    wo_number: w.wo_number,
    job_type: w.job_type,
    status: w.status,
    scheduled_date: w.scheduled_date,
    notes: w.notes,
    customer_name: w.customers?.name || '',
    serial_numbers: rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[],
    site_name: site?.site_name || null,
    distanceKm,
  }
}

// Single embedded query (work orders + customer + transformers + sites) instead of
// a main query followed by separate round trips for each related table — those extra
// round trips were the main reason mobile pages felt slow.
async function fetchEngineerWorkOrders(
  admin: ReturnType<typeof adminClient>,
  userId: string
): Promise<MobileWorkOrder[]> {
  const [{ data: wos, error }, engineerLoc] = await Promise.all([
    admin.from('work_orders').select(WORK_ORDER_SELECT).eq('engineer_id', userId).order('scheduled_date', { ascending: true }),
    getEngineerLocation(admin, userId),
  ])

  // Surface real query failures instead of silently returning an empty list — this
  // used to just log and fall through to [], which read identically to "no jobs
  // assigned" on every mobile screen (dashboard stats, jobs list) with no visible error.
  if (error) {
    console.error('fetchEngineerWorkOrders:', error.message)
    throw new Error(error.message)
  }
  const rows = (wos as unknown as WorkOrderEmbed[]) || []

  let siteCoordsById: Record<string, { lat: number; lng: number }> = {}
  if (engineerLoc) {
    try {
      const siteIds = [...new Set(rows.map(w => w.work_order_transformers?.[0]?.transformers?.customer_sites?.id).filter(Boolean))] as string[]
      if (siteIds.length) {
        const { data: sites } = await admin.from('customer_sites').select('id, latitude, longitude').in('id', siteIds)
        const map: Record<string, { lat: number; lng: number }> = {}
        ;(sites || []).forEach(s => { if (s.latitude != null && s.longitude != null) map[s.id] = { lat: s.latitude, lng: s.longitude } })
        siteCoordsById = map
      }
    } catch (e) {
      console.error('fetchEngineerWorkOrders (site coords):', e)
    }
  }

  return rows.map(w => mapWorkOrderEmbed(w, engineerLoc, siteCoordsById))
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
  rating: string | null
  manufacturer: string | null
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
    ...mapWorkOrderEmbed(w, null, {}),
    customer_id: w.customer_id,
    customer_contact: w.customers?.contact_person || null,
    customer_phone: w.customers?.phone || null,
    site_address: rows[0]?.transformers?.customer_sites?.site_address || null,
    rating: rows[0]?.transformers?.rating || null,
    manufacturer: rows[0]?.transformers?.manufacturer || null,
  }
}

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, user.id),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    return { workOrders: workOrders.filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment'), engineer, error: null }
  } catch (e: unknown) {
    return { workOrders: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface MobileDashboardStats {
  assigned: number
  inProgress: number
  needsReassignment: number
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
    const user = await getAuthedUser(sb)
    if (!user) return { stats: { assigned: 0, inProgress: 0, needsReassignment: 0, completed: 0 }, recentJobs: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, user.id),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    // "Pending" is no longer a distinct status — a visit that couldn't be finished in
    // a day stays In Progress with a follow-up date, so it's already counted there.
    const stats: MobileDashboardStats = {
      assigned: workOrders.filter(w => w.status === 'assigned' || w.status === 'unassigned').length,
      inProgress: workOrders.filter(w => w.status === 'in_progress').length,
      needsReassignment: workOrders.filter(w => w.status === 'needs_reassignment').length,
      completed: workOrders.filter(w => w.status === 'completed').length,
    }

    const recentJobs = workOrders.filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment').slice(0, 3)

    return { stats, recentJobs, engineer, error: null }
  } catch (e: unknown) {
    return { stats: { assigned: 0, inProgress: 0, needsReassignment: 0, completed: 0 }, recentJobs: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface OverdueFollowUp {
  workOrderId: string
  woNumber: string
  customerName: string
  dueDate: string
  // 'pending' = closed with a revisit date that's passed. 'stale_in_progress' = still
  // checked in from a previous day, never closed out (engineer likely forgot).
  kind: 'pending' | 'stale_in_progress'
}

// Two situations surfaced as a prompt on dashboard load so a job doesn't just sit
// there unresolved: (1) Pending jobs (not flagged for reassignment — those are no
// longer this engineer's responsibility) whose most recent closure's revisit_date has
// already passed, and (2) In-progress jobs checked into on a previous day and never
// closed out — these otherwise stay stuck forever since there's no closure/revisit
// date to compare against.
export async function getOverdueFollowUps(): Promise<{ followUps: OverdueFollowUp[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { followUps: [], error: 'Not authenticated' }

    const admin = adminClient()
    const workOrders = await fetchEngineerWorkOrders(admin, user.id)
    const pending = workOrders.filter(w => w.status === 'pending')
    const inProgress = workOrders.filter(w => w.status === 'in_progress')
    if (!pending.length && !inProgress.length) return { followUps: [], error: null }

    const todayStr = new Date().toLocaleDateString('en-CA')
    const followUps: OverdueFollowUp[] = []

    if (pending.length) {
      const woIds = pending.map(w => w.id)
      const { data: closures } = await admin
        .from('work_order_daily_closures')
        .select('work_order_id, revisit_date, created_at')
        .in('work_order_id', woIds)
        .order('created_at', { ascending: false })

      // Closures already ordered desc, so the first match per work order is the latest.
      const latestRevisitByWo: Record<string, string | null> = {}
      for (const c of closures || []) {
        if (!(c.work_order_id in latestRevisitByWo)) latestRevisitByWo[c.work_order_id] = c.revisit_date
      }

      for (const w of pending) {
        const rd = latestRevisitByWo[w.id]
        if (rd && rd < todayStr) followUps.push({ workOrderId: w.id, woNumber: w.wo_number, customerName: w.customer_name, dueDate: rd, kind: 'pending' })
      }
    }

    if (inProgress.length) {
      const woIds = inProgress.map(w => w.id)
      const { data: checkins } = await admin
        .from('work_order_checkins')
        .select('work_order_id, checked_in_at')
        .in('work_order_id', woIds)
        .order('checked_in_at', { ascending: false })

      const latestCheckinByWo: Record<string, string> = {}
      for (const c of checkins || []) {
        if (!(c.work_order_id in latestCheckinByWo)) latestCheckinByWo[c.work_order_id] = c.checked_in_at
      }

      for (const w of inProgress) {
        const lastCheckin = latestCheckinByWo[w.id]
        if (!lastCheckin) continue
        const lastCheckinDateStr = new Date(lastCheckin).toLocaleDateString('en-CA')
        if (lastCheckinDateStr >= todayStr) continue // checked in today — not stale

        // Overdue is judged against scheduled_date (falling back to the check-in date
        // if none is set), not the raw check-in date — scheduled_date is exactly what
        // rescheduleFollowUp() updates for this kind, so pushing it to a future date
        // correctly stops the prompt from reappearing.
        const dueDateStr = w.scheduled_date || lastCheckinDateStr
        if (dueDateStr < todayStr) {
          followUps.push({ workOrderId: w.id, woNumber: w.wo_number, customerName: w.customer_name, dueDate: dueDateStr, kind: 'stale_in_progress' })
        }
      }
    }

    return { followUps, error: null }
  } catch (e: unknown) {
    return { followUps: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Lightweight date-only update — no new sign-off, since nothing about the visit
// itself changed, just when the engineer expects to come back. Pending jobs have a
// closure to update the revisit_date on; a stale in-progress job was never closed at
// all, so there's nothing to update but the notification's own scheduled_date.
export async function rescheduleFollowUp(workOrderId: string, newDate: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()

    const woResult = await withTimeout(
      admin.from('work_orders').select('engineer_id, status').eq('id', workOrderId).single(),
      8000
    )
    const wo = woResult?.data
    if (!wo) return { error: 'Notification not found' }
    if (wo.engineer_id !== user.id) return { error: 'Not authorized to reschedule this notification' }
    if (wo.status !== 'pending' && wo.status !== 'in_progress') return { error: 'This notification no longer needs rescheduling' }

    if (wo.status === 'in_progress') {
      const updateResult = await withTimeout(
        admin.from('work_orders').update({ scheduled_date: newDate, updated_at: new Date().toISOString() }).eq('id', workOrderId),
        8000
      )
      if (!updateResult) return { error: 'Saving is taking longer than expected — please try again.' }
      if (updateResult.error) return { error: updateResult.error.message }
    } else {
      const closureResult = await withTimeout(
        admin.from('work_order_daily_closures')
          .select('id')
          .eq('work_order_id', workOrderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        8000
      )
      const latestClosureId = closureResult?.data?.id
      if (!latestClosureId) return { error: 'No closure found to reschedule' }

      const updateResult = await withTimeout(
        admin.from('work_order_daily_closures').update({ revisit_date: newDate }).eq('id', latestClosureId),
        8000
      )
      if (!updateResult) return { error: 'Saving is taking longer than expected — please try again.' }
      if (updateResult.error) return { error: updateResult.error.message }
    }

    const formattedDate = new Date(newDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    logActivity(admin, workOrderId, user.id, `Rescheduled follow-up to ${formattedDate}`).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileJobsList(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
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
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { 'User-Agent': 'EMR-Portal-Mobile/1.0 (field service check-in)' } }
      ),
      6000
    )
    if (!res || !res.ok) return { label: null }
    const data = await res.json()
    return { label: extractPlaceLabel(data.address || {}, data.display_name) }
  } catch {
    return { label: null }
  }
}

// Passive "last seen" location — captured on mobile app open (dashboard mount), not
// tied to any particular job, so desktop can show where an engineer actually is even
// between site visits. Silently a no-op on failure (denied permission, no signal,
// reverse-geocode timeout) — this is a best-effort background ping, never something
// that should surface an error to the engineer.
export async function recordLastSeen(lat: number, lng: number): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { label } = await reverseGeocode(lat, lng)
    await withTimeout(
      admin.from('profiles').update({
        last_seen_lat: lat,
        last_seen_lng: lng,
        last_seen_place_label: label,
        last_seen_at: new Date().toISOString(),
      }).eq('id', user.id),
      8000
    )
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export type EngineerStatusValue = 'available' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed'

export interface AssignableSite {
  workOrderId: string
  woNumber: string
  siteName: string
}

export interface EngineerStatusPrompt {
  // True once per calendar day, until the engineer either sets a status themselves or
  // checks in somewhere (which auto-sets it to "reached" — see submitCheckIn).
  needsPrompt: boolean
  currentStatus: EngineerStatusValue
  assignableSites: AssignableSite[]
}

export async function getEngineerStatusPrompt(): Promise<{ prompt: EngineerStatusPrompt | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { prompt: null, error: 'Not authenticated' }

    const admin = adminClient()
    const [{ data: profile }, workOrders] = await Promise.all([
      admin.from('profiles').select('engineer_status, engineer_status_updated_at').eq('id', user.id).maybeSingle(),
      fetchEngineerWorkOrders(admin, user.id),
    ])

    const todayStr = new Date().toLocaleDateString('en-CA')
    const updatedToday = !!profile?.engineer_status_updated_at && new Date(profile.engineer_status_updated_at).toLocaleDateString('en-CA') === todayStr

    const assignableSites: AssignableSite[] = workOrders
      .filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment')
      .map(w => ({ workOrderId: w.id, woNumber: w.wo_number, siteName: w.site_name || w.customer_name }))

    return {
      prompt: {
        needsPrompt: !updatedToday,
        currentStatus: (profile?.engineer_status as EngineerStatusValue) || 'available',
        assignableSites,
      },
      error: null,
    }
  } catch (e: unknown) {
    return { prompt: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function setEngineerStatus(status: EngineerStatusValue, workOrderId?: string | null): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    if ((status === 'on_the_way' || status === 'travelling') && !workOrderId) {
      return { error: 'Pick a project' }
    }

    const admin = adminClient()
    const { error } = await admin.from('profiles').update({
      engineer_status: status,
      engineer_status_work_order_id: status === 'available' || status === 'on_leave' ? null : (workOrderId || null),
      engineer_status_updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    const STATUS_LABEL: Record<EngineerStatusValue, string> = {
      available: 'Available', on_leave: 'On Leave', on_the_way: 'On the way', travelling: 'Travelling', reached: 'Reached project', completed: 'Completed',
    }
    logSystemActivity(admin, { actorId: user.id, actorName, action: `Set status to ${STATUS_LABEL[status]}`, entityType: 'engineer_status', entityId: user.id }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Fire-and-forget from callers (not awaited) — a logging failure or a slow network
// must never hold up the check-in/closure response the field engineer is waiting on.
async function logActivity(admin: ReturnType<typeof adminClient>, woId: string, userId: string, action: string) {
  try {
    const profileResult = await withTimeout(
      admin.from('profiles').select('first_name, last_name').eq('id', userId).single(),
      6000
    )
    const actor = profileResult?.data
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    await withTimeout(
      admin.from('work_order_activity').insert({
        work_order_id: woId,
        action: `${action} by ${actorName}`,
        actor_name: actorName,
      }),
      6000
    )
    await withTimeout(
      logSystemActivity(admin, { actorId: userId, actorName, action, entityType: 'work_order', entityId: woId }),
      6000
    )
  } catch {
    // best-effort only
  }
}

// For screens (check-in, closure) that only need the work order + customer info,
// not the full hub detail (checkin history, closures, previous visits) — no reason
// to pay for those extra queries on a page that never renders them.
export async function getMobileWorkOrderBasic(woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { workOrder: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, error: 'Notification not found' }
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
  latestClosure: {
    outcome: string; created_at: string; revisitDate: string | null; needsReassignment: boolean
    engineerId: string | null; engineerName: string; summary: string; pendingReason: string | null; materialsRequired: string | null
  } | null
  // Set only when the last closure was made by a different engineer than the one
  // viewing now — i.e. this job was handed over/reassigned to the current engineer.
  handoverFromOtherEngineer: boolean
  previousVisits: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[]
}

export async function getMobileWorkOrderDetail(woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { detail: null, error: 'Not authenticated' }

    const admin = adminClient()
    touchHeartbeat(admin, user.id)
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
    // customer as a whole — a customer can have many sites/transformers, and pulling
    // in any of their other work orders showed the wrong site's history here.
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
    // "Checked in" means checked in *today* and since the last closure — once a visit
    // is closed (e.g. marked pending) the engineer needs to check in again for the next
    // visit, and a check-in from a previous day that was never closed out (engineer
    // forgot to do end-of-day closure) shouldn't leave the job stuck showing only the
    // closure button indefinitely — check-in reappears so they can start today's visit.
    const checkedInToday = !!lastCheckinAt && new Date(lastCheckinAt).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
    const hasCheckedIn = checkedInToday && (!latestClosure || new Date(lastCheckinAt!) > new Date(latestClosure.created_at))

    return {
      detail: {
        workOrder,
        hasCheckedIn,
        lastCheckinAt,
        hasFormSubmission: !!submission?.length,
        latestClosure,
        handoverFromOtherEngineer: !!(latestClosure?.engineerId && latestClosure.engineerId !== user.id),
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

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
