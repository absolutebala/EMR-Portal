// Shared helpers and types used by both the PWA's server actions
// (app/actions/mobile-actions.ts) and the React Native REST routes
// (app/api/mobile/v1/*). No 'use server' here — plain functions callable from either
// a Server Action file or a Route Handler. Business logic lives here exactly once;
// only the auth-resolution step differs between the two callers.
import { extractPlaceLabel } from '@/lib/geocode'
import { logActivity as logSystemActivity } from '@/lib/activity-log'
import { adminClient } from '@/lib/db/admin-client'

export { adminClient }
export type AdminClient = ReturnType<typeof adminClient>

// Storage/network calls have no built-in timeout — a stalled request would otherwise
// hang the whole request (and the caller's UI) indefinitely.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

// Fire-and-forget presence heartbeat — called from the mobile app's main data-fetch
// entry points so the desktop Field Engineers page has a general "recently active"
// signal, independent of the explicit engineer_status the engineer sets themselves.
export function touchHeartbeat(admin: AdminClient, userId: string) {
  admin.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId).then(
    () => {},
    () => {}
  )
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
export async function getEngineerLocation(admin: AdminClient, userId: string): Promise<{ lat: number; lng: number } | null> {
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

export interface MobileWorkOrderWithCustomer extends MobileWorkOrder {
  customer_id: string
  customer_contact: string | null
  customer_phone: string | null
  site_address: string | null
  rating: string | null
  manufacturer: string | null
  engineer_name?: string | null
}

type WorkOrderEmbed = {
  id: string; wo_number: string; job_type: string; status: string
  scheduled_date: string | null; notes: string | null; customer_id: string
  customers: { name: string; contact_person: string; phone: string } | null
  work_order_transformers: { transformers: { serial_number: string; rating: string | null; manufacturer: string | null; customer_sites: { id: string; site_name: string; site_address: string } | null } | null }[]
}

export const WORK_ORDER_SELECT = `
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
export async function fetchEngineerWorkOrders(admin: AdminClient, userId: string): Promise<MobileWorkOrder[]> {
  const [{ data: wos, error }, { data: additionalAssignments }, engineerLoc] = await Promise.all([
    admin.from('work_orders').select(WORK_ORDER_SELECT).eq('engineer_id', userId).order('scheduled_date', { ascending: true }),
    // Jobs where this engineer is an additional (non-primary) assignee — see
    // work_order_engineer_assignments. Real, mobile-visible assignment, distinct from
    // the visibility-only work_order_additional_engineers (virtual-call participants).
    admin.from('work_order_engineer_assignments').select('work_order_id').eq('engineer_id', userId),
    getEngineerLocation(admin, userId),
  ])

  // Surface real query failures instead of silently returning an empty list — this
  // used to just log and fall through to [], which read identically to "no jobs
  // assigned" on every mobile screen (dashboard stats, jobs list) with no visible error.
  if (error) {
    console.error('fetchEngineerWorkOrders:', error.message)
    throw new Error(error.message)
  }
  const primaryRows = (wos as unknown as WorkOrderEmbed[]) || []

  const additionalWoIds = [...new Set((additionalAssignments || []).map(a => a.work_order_id))]
    .filter(id => !primaryRows.some(w => w.id === id))
  let additionalRows: WorkOrderEmbed[] = []
  if (additionalWoIds.length) {
    const { data: extraWos, error: extraError } = await admin.from('work_orders').select(WORK_ORDER_SELECT).in('id', additionalWoIds)
    if (extraError) {
      console.error('fetchEngineerWorkOrders (additional assignments):', extraError.message)
      throw new Error(extraError.message)
    }
    additionalRows = (extraWos as unknown as WorkOrderEmbed[]) || []
  }
  const rows = [...primaryRows, ...additionalRows]

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

export async function getEngineerName(admin: AdminClient, userId: string): Promise<{ name: string; avatarUrl: string | null } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, avatar_url')
    .eq('id', userId)
    .single()
  return profile ? { name: `${profile.first_name} ${profile.last_name}`, avatarUrl: profile.avatar_url } : null
}

export async function fetchSingleWorkOrder(admin: AdminClient, woId: string): Promise<MobileWorkOrderWithCustomer | null> {
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

// Fire-and-forget from callers (not awaited) — a logging failure or a slow network
// must never hold up the check-in/closure response the field engineer is waiting on.
export async function logActivity(admin: AdminClient, woId: string, userId: string, action: string) {
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

export async function reverseGeocodeCore(lat: number, lng: number): Promise<{ label: string | null }> {
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

export interface MobileDashboardStats {
  assigned: number
  inProgress: number
  needsReassignment: number
  completed: number
}

export interface OverdueFollowUp {
  workOrderId: string
  woNumber: string
  customerName: string
  dueDate: string
  // 'pending' = closed with a revisit date that's passed. 'stale_in_progress' = still
  // checked in from a previous day, never closed out (engineer likely forgot).
  // 'open_checkin' = same-day version of 'stale_in_progress'.
  kind: 'pending' | 'stale_in_progress' | 'open_checkin'
}

export type EngineerStatusValue = 'available' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed'

export interface AssignableSite {
  workOrderId: string
  woNumber: string
  siteName: string
}

export interface EngineerStatusPrompt {
  needsPrompt: boolean
  currentStatus: EngineerStatusValue
  assignableSites: AssignableSite[]
}

export interface NotStartedNotice {
  projectLabel: string
}

export interface CheckinDriftNotice {
  workOrderId: string
  projectLabel: string
  distanceKm: number
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
  handoverFromOtherEngineer: boolean
  previousVisits: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[]
  // Serial numbers the viewing engineer is specifically responsible for, from
  // work_order_engineer_assignments — null means "whole notification, no split"
  // (the primary engineer with no carve-outs against them, or an additional
  // engineer assigned without a specific serial).
  myAssignedSerials: string[] | null
}

export interface MobileFormRow {
  id: string
  table_id: string
  parent_row_id: string | null
  row_label: string
  row_label_hi?: string | null
  sno_label: string | null
  sno_label_hi?: string | null
  order_index: number
}

export interface MobileFormTable {
  id: string
  section_id: string
  status_type: string
  has_subrows: boolean
  col1_label: string | null
  col1_label_hi?: string | null
  col2_label: string | null
  col2_label_hi?: string | null
  order_index: number
  rows: MobileFormRow[]
}

export interface MobileFormField {
  id: string
  section_id: string
  label: string
  label_hi?: string | null
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
  title_hi?: string | null
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
