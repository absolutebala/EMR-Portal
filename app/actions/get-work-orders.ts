'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import type { WorkOrder } from '@/lib/types'
import type { MobileFormSection, MobileFormField, MobileFormTable, MobileFormRow } from '@/app/actions/mobile-actions'
import { extractPlaceLabel } from '@/lib/geocode'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface WorkOrderCheckinInfo {
  latitude: number | null
  longitude: number | null
  placeName: string | null
  photoUrl: string | null
  checkedInAt: string
}

export interface WorkOrderClosureInfo {
  outcome: string
  summary: string
  pendingReason: string | null
  materialsRequired: string | null
  revisitDate: string | null
  needsReassignment: boolean
  createdAt: string
}

export interface WorkOrderSubmittedForm {
  formName: string
  submittedAt: string | null
  sections: MobileFormSection[]
  fieldValues: Record<string, string>
  rowValues: Record<string, { status: string; remarks: string }>
}

// One entry per check-in → closure cycle, richer than the raw work_order_visits
// row (which only carries sign-off data) — merges in the matching check-in
// (time/photo/location) and the daily-closure outcome fields (reason, materials,
// revisit date, reassignment flag) so the desktop detail page can render a full
// date-wise visit history in one place.
export interface WorkOrderVisit {
  id: string
  outcome: 'completed' | 'pending' | 'in_progress'
  engineerName: string
  clientName: string | null
  engineerSignature: string | null
  clientSignature: string | null
  pdfUrl: string | null
  wordUrl: string | null
  sentToSap: boolean
  createdAt: string
  summary: string | null
  pendingReason: string | null
  materialsRequired: string | null
  revisitDate: string | null
  needsReassignment: boolean
  checkin: {
    checkedInAt: string
    placeName: string | null
    latitude: number | null
    longitude: number | null
    photoUrl: string | null
  } | null
}

export async function getWorkOrders(): Promise<{ workOrders: WorkOrder[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { workOrders: [], error: 'Not authenticated' }

    const admin = adminClient()

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role

    const { data: wos, error } = await admin
      .from('work_orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return { workOrders: [], error: error.message }
    if (!wos?.length) return { workOrders: [], error: null }

    // Field Engineers see only their assigned work orders
    const filtered = role === 'Field Engineer'
      ? wos.filter(w => w.engineer_id === user.id)
      : wos

    const woIds = filtered.map(w => w.id)
    const customerIds = [...new Set(filtered.map(w => w.customer_id))]
    const engineerIds = [...new Set(filtered.map(w => w.engineer_id).filter(Boolean))]
    const categoryIds = [...new Set(filtered.map(w => w.customer_category_id).filter(Boolean))]

    const [{ data: wotRows }, { data: customers }, { data: engineers }, { data: categories }] = await Promise.all([
      admin.from('work_order_transformers').select('work_order_id, transformer_id, transformers(serial_number, warranty_status, site_id, customer_sites(site_name))').in('work_order_id', woIds),
      admin.from('customers').select('id, name').in('id', customerIds),
      engineerIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds) : Promise.resolve({ data: [] }),
      categoryIds.length ? admin.from('customer_categories').select('id, name').in('id', categoryIds) : Promise.resolve({ data: [] }),
    ])

    const custMap: Record<string, string> = {}
    customers?.forEach((c: { id: string; name: string }) => { custMap[c.id] = c.name })

    const engMap: Record<string, string> = {}
    engineers?.forEach((e: { id: string; first_name: string; last_name: string }) => { engMap[e.id] = `${e.first_name} ${e.last_name}` })

    const categoryMap: Record<string, string> = {}
    categories?.forEach((c: { id: string; name: string }) => { categoryMap[c.id] = c.name })

    type WotRow = { work_order_id: string; transformer_id: string; transformers: { serial_number: string; warranty_status: string; site_id: string | null; customer_sites: { site_name: string } | null } | null }
    const wotByWo: Record<string, WotRow[]> = {}
    ;(wotRows as unknown as WotRow[])?.forEach((r: WotRow) => {
      if (!wotByWo[r.work_order_id]) wotByWo[r.work_order_id] = []
      wotByWo[r.work_order_id].push(r)
    })

    const result: WorkOrder[] = filtered.map(w => {
      const rows = wotByWo[w.id] || []
      const serialNumbers = rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[]
      const transformerIds = rows.map(r => r.transformer_id)
      const hasWarranty = rows.some(r => r.transformers?.warranty_status === 'under_warranty')
      const siteName = rows[0]?.transformers?.customer_sites?.site_name || null
      return {
        ...w,
        customer_name: custMap[w.customer_id] || '',
        engineer_name: w.engineer_id ? (engMap[w.engineer_id] || '') : null,
        serial_numbers: serialNumbers,
        transformer_ids: transformerIds,
        site_name: siteName,
        has_warranty: hasWarranty,
        customer_category_name: w.customer_category_id ? (categoryMap[w.customer_category_id] || null) : null,
      }
    })

    return { workOrders: result, error: null }
  } catch (e: unknown) {
    return { workOrders: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getWorkOrderDetail(id: string): Promise<{
  workOrder: WorkOrder | null
  activity: { action: string; actor_name: string | null; created_at: string }[]
  checkin: WorkOrderCheckinInfo | null
  closure: WorkOrderClosureInfo | null
  submittedForm: WorkOrderSubmittedForm | null
  visits: WorkOrderVisit[]
  error: string | null
}> {
  const empty = { workOrder: null, activity: [], checkin: null, closure: null, submittedForm: null, visits: [] }
  try {
    const admin = adminClient()
    const [{ data: wo }, { data: wotRows }, { data: actRows }] = await Promise.all([
      admin.from('work_orders').select('*').eq('id', id).single(),
      admin.from('work_order_transformers').select('work_order_id, transformer_id, transformers(serial_number, warranty_status, customer_sites(site_name))').eq('work_order_id', id),
      admin.from('work_order_activity').select('action, actor_name, created_at').eq('work_order_id', id).order('created_at', { ascending: false }),
    ])

    if (!wo) return { ...empty, error: 'Not found' }

    const [{ data: customer }, { data: engineer }, { data: checkinRow }, { data: closureRow }, { data: formRow }, { data: allCheckins }, { data: allClosures }, { data: additionalEngineerRows }, { data: categoryRow }] = await Promise.all([
      admin.from('customers').select('name').eq('id', wo.customer_id).single(),
      wo.engineer_id ? admin.from('profiles').select('first_name, last_name').eq('id', wo.engineer_id).single() : Promise.resolve({ data: null }),
      admin.from('work_order_checkins').select('latitude, longitude, place_name, photo_url, checked_in_at').eq('work_order_id', id).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('work_order_daily_closures').select('outcome, summary, pending_reason, materials_required, revisit_date, needs_reassignment, created_at').eq('work_order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('forms').select('id, name').eq('job_type', wo.job_type).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('work_order_checkins')
        .select('latitude, longitude, place_name, photo_url, checked_in_at')
        .eq('work_order_id', id)
        .order('checked_in_at', { ascending: true }),
      admin.from('work_order_daily_closures')
        .select('id, outcome, summary, pending_reason, materials_required, revisit_date, needs_reassignment, engineer_signature, client_name, client_signature, pdf_url, word_url, sent_to_sap, engineer_id, created_at')
        .eq('work_order_id', id)
        .order('created_at', { ascending: true }),
      admin.from('work_order_additional_engineers').select('engineer_id, profiles(first_name, last_name)').eq('work_order_id', id),
      wo.customer_category_id ? admin.from('customer_categories').select('name').eq('id', wo.customer_category_id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    type AdditionalEngineerRow = { engineer_id: string; profiles: { first_name: string; last_name: string } | null }
    const additionalEngineers = ((additionalEngineerRows as unknown as AdditionalEngineerRow[]) || []).map(r => ({
      id: r.engineer_id,
      name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'Engineer',
    }))

    // Build a date-wise visit history: each closure marks the end of a
    // check-in → closure cycle, so pair every closure with the check-in(s)
    // that happened before it (most recent one wins). Any check-ins left over
    // after the last closure represent the visit currently in progress.
    type CheckinRow = { latitude: number | null; longitude: number | null; place_name: string | null; photo_url: string | null; checked_in_at: string }
    type ClosureRow = {
      id: string; outcome: string; summary: string; pending_reason: string | null; materials_required: string | null
      revisit_date: string | null; needs_reassignment: boolean; engineer_signature: string | null
      client_name: string | null; client_signature: string | null; pdf_url: string | null; word_url: string | null; sent_to_sap: boolean
      engineer_id: string | null; created_at: string
    }
    const sortedCheckins = (allCheckins as CheckinRow[] | null) || []
    const sortedClosures = (allClosures as ClosureRow[] | null) || []

    const closureEngineerIds = [...new Set(sortedClosures.map(c => c.engineer_id).filter(Boolean))] as string[]
    const { data: closureEngineers } = closureEngineerIds.length
      ? await admin.from('profiles').select('id, first_name, last_name').in('id', closureEngineerIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] }
    const engineerNameMap: Record<string, string> = {}
    ;(closureEngineers || []).forEach(e => { engineerNameMap[e.id] = `${e.first_name} ${e.last_name}` })

    let ci = 0
    const visits: WorkOrderVisit[] = sortedClosures.map(c => {
      let matchedCheckin: CheckinRow | null = null
      while (ci < sortedCheckins.length && sortedCheckins[ci].checked_in_at <= c.created_at) {
        matchedCheckin = sortedCheckins[ci]
        ci++
      }
      return {
        id: c.id,
        outcome: c.outcome as 'completed' | 'pending',
        engineerName: c.engineer_id ? (engineerNameMap[c.engineer_id] || 'Engineer') : 'Engineer',
        clientName: c.client_name,
        engineerSignature: c.engineer_signature,
        clientSignature: c.client_signature,
        pdfUrl: c.pdf_url,
        wordUrl: c.word_url,
        sentToSap: c.sent_to_sap,
        createdAt: c.created_at,
        summary: c.summary,
        pendingReason: c.pending_reason,
        materialsRequired: c.materials_required,
        revisitDate: c.revisit_date,
        needsReassignment: c.needs_reassignment,
        checkin: matchedCheckin ? {
          checkedInAt: matchedCheckin.checked_in_at,
          placeName: matchedCheckin.place_name,
          latitude: matchedCheckin.latitude,
          longitude: matchedCheckin.longitude,
          photoUrl: matchedCheckin.photo_url,
        } : null,
      }
    })

    // Leftover check-ins after the last closure = the current, still-open visit.
    if (ci < sortedCheckins.length) {
      const ongoing = sortedCheckins[sortedCheckins.length - 1]
      visits.push({
        id: `ongoing-${ongoing.checked_in_at}`,
        outcome: 'in_progress',
        engineerName: engineer ? `${engineer.first_name} ${engineer.last_name}` : 'Engineer',
        clientName: null,
        engineerSignature: null,
        clientSignature: null,
        pdfUrl: null,
        wordUrl: null,
        sentToSap: false,
        createdAt: ongoing.checked_in_at,
        summary: null,
        pendingReason: null,
        materialsRequired: null,
        revisitDate: null,
        needsReassignment: false,
        checkin: {
          checkedInAt: ongoing.checked_in_at,
          placeName: ongoing.place_name,
          latitude: ongoing.latitude,
          longitude: ongoing.longitude,
          photoUrl: ongoing.photo_url,
        },
      })
    }

    visits.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    type WotRow = { work_order_id: string; transformer_id: string; transformers: { serial_number: string; warranty_status: string; customer_sites: { site_name: string } | null } | null }
    const rows = (wotRows as unknown as WotRow[]) || []
    const serialNumbers = rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[]
    const hasWarranty = rows.some(r => r.transformers?.warranty_status === 'under_warranty')
    const siteName = rows[0]?.transformers?.customer_sites?.site_name || null

    const checkin: WorkOrderCheckinInfo | null = checkinRow ? {
      latitude: checkinRow.latitude,
      longitude: checkinRow.longitude,
      placeName: checkinRow.place_name,
      photoUrl: checkinRow.photo_url,
      checkedInAt: checkinRow.checked_in_at,
    } : null

    const closure: WorkOrderClosureInfo | null = closureRow ? {
      outcome: closureRow.outcome,
      summary: closureRow.summary,
      pendingReason: closureRow.pending_reason,
      materialsRequired: closureRow.materials_required,
      revisitDate: closureRow.revisit_date,
      needsReassignment: closureRow.needs_reassignment,
      createdAt: closureRow.created_at,
    } : null

    let submittedForm: WorkOrderSubmittedForm | null = null
    if (formRow) {
      type SectionEmbed = {
        id: string; title: string; order_index: number
        form_fields: MobileFormField[]
        form_tables: (MobileFormTable & { form_table_rows: MobileFormRow[] })[]
      }
      const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index

      const [{ data: secs }, { data: sub }] = await Promise.all([
        admin.from('form_sections')
          .select('id, title, order_index, form_fields(*), form_tables(*, form_table_rows(*))')
          .eq('form_id', formRow.id)
          .order('order_index'),
        admin.from('form_submissions')
          .select('form_data, submitted_at')
          .eq('work_order_id', id)
          .eq('form_id', formRow.id)
          .maybeSingle(),
      ])

      if (sub) {
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
        const formData = sub.form_data as { fields?: Record<string, string>; table_rows?: Record<string, { status: string; remarks: string }> }
        submittedForm = {
          formName: formRow.name,
          submittedAt: sub.submitted_at,
          sections,
          fieldValues: formData?.fields || {},
          rowValues: formData?.table_rows || {},
        }
      }
    }

    return {
      workOrder: {
        ...wo,
        customer_name: customer?.name || '',
        engineer_name: engineer ? `${engineer.first_name} ${engineer.last_name}` : null,
        serial_numbers: serialNumbers,
        transformer_ids: rows.map(r => r.transformer_id),
        site_name: siteName,
        has_warranty: hasWarranty,
        additional_engineers: additionalEngineers,
        customer_category_name: categoryRow?.name || null,
      },
      activity: actRows || [],
      checkin,
      closure,
      submittedForm,
      visits,
      error: null,
    }
  } catch (e: unknown) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function searchTransformersBySerial(query: string): Promise<{ results: { transformer_id: string; serial_number: string; customer_id: string; customer_name: string; site_name: string | null; warranty_status: string }[] }> {
  if (!query || query.length < 2) return { results: [] }
  const admin = adminClient()
  const { data } = await admin
    .from('transformers')
    .select('id, serial_number, warranty_status, customer_id, customers(name), customer_sites(site_name)')
    .ilike('serial_number', `%${query}%`)
    .limit(10)

  type Row = { id: string; serial_number: string; warranty_status: string; customer_id: string; customers: { name: string } | null; customer_sites: { site_name: string } | null }
  return {
    results: ((data as unknown as Row[]) || []).map((r: Row) => ({
      transformer_id: r.id,
      serial_number: r.serial_number,
      customer_id: r.customer_id,
      customer_name: r.customers?.name || '',
      site_name: r.customer_sites?.site_name || null,
      warranty_status: r.warranty_status,
    })),
  }
}

export async function searchCustomersByName(query: string): Promise<{ results: { customer_id: string; name: string; phone: string; contact_person: string }[] }> {
  if (!query || query.length < 2) return { results: [] }
  const admin = adminClient()
  const { data } = await admin
    .from('customers')
    .select('id, name, phone, contact_person')
    .ilike('name', `%${query}%`)
    .limit(10)

  return {
    results: (data || []).map(c => ({
      customer_id: c.id,
      name: c.name,
      phone: c.phone,
      contact_person: c.contact_person,
    })),
  }
}

// Storage/network calls have no built-in timeout — bound them so a stalled geocoding
// request can't hang the whole assign/reassign dropdown load.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Coordinates are cached on customer_sites after the first lookup — Nominatim's usage
// policy expects results to be cached, not re-queried on every dropdown load.
async function getSiteCoordinates(admin: ReturnType<typeof adminClient>, siteId: string): Promise<{ lat: number; lng: number; placeLabel: string | null } | null> {
  const { data: site } = await admin.from('customer_sites').select('site_address, latitude, longitude, place_label').eq('id', siteId).maybeSingle()
  if (!site) return null
  if (site.latitude != null && site.longitude != null) return { lat: site.latitude, lng: site.longitude, placeLabel: site.place_label ?? null }
  if (!site.site_address) return null

  const res = await withTimeout(
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(site.site_address)}&limit=1`,
      { headers: { 'User-Agent': 'EMR-Portal/1.0 (site geocoding for engineer assignment)' } }
    ),
    6000
  )
  if (!res || !res.ok) return null
  const results = await res.json().catch(() => null)
  const first = results?.[0]
  if (!first) return null
  const lat = parseFloat(first.lat)
  const lng = parseFloat(first.lon)
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  const placeLabel = extractPlaceLabel(first.address || {}, first.display_name)

  await admin.from('customer_sites').update({ latitude: lat, longitude: lng, place_label: placeLabel }).eq('id', siteId)
  return { lat, lng, placeLabel }
}

export interface AssignableEngineer {
  id: string
  first_name: string
  last_name: string
  role: string
  distanceKm: number | null
  lastCheckinPlace: string | null
  lastCheckinAt: string | null
}

export async function getAssignableEngineers(workOrderId?: string): Promise<{ engineers: AssignableEngineer[] }> {
  const admin = adminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, role, last_seen_lat, last_seen_lng, last_seen_at')
    // An engineer marked On Leave isn't available to take on a new job.
    .eq('role', 'Field Engineer')
    .neq('engineer_status', 'on_leave')
    .order('first_name')
  const engineers: AssignableEngineer[] = (data || []).map(e => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, role: e.role, distanceKm: null, lastCheckinPlace: null, lastCheckinAt: null }))
  if (!workOrderId) return { engineers }
  const lastSeenByEng: Record<string, { lat: number | null; lng: number | null; at: string | null }> = {}
  ;(data || []).forEach(e => { lastSeenByEng[e.id] = { lat: e.last_seen_lat, lng: e.last_seen_lng, at: e.last_seen_at } })

  const { data: wotRows } = await admin
    .from('work_order_transformers')
    .select('transformers(site_id)')
    .eq('work_order_id', workOrderId)
    .limit(1)
  type Row = { transformers: { site_id: string | null } | null }
  const siteId = ((wotRows as unknown as Row[]) || [])[0]?.transformers?.site_id

  const siteCoords = siteId ? await getSiteCoordinates(admin, siteId) : null

  // Most recent check-in per engineer, across all their work orders, as a proxy for
  // "where are they right now" — there's no live GPS tracking (see Field Engineers
  // page notes), just historical site check-ins.
  const { data: checkins } = await admin
    .from('work_order_checkins')
    .select('engineer_id, latitude, longitude, place_name, checked_in_at')
    .order('checked_in_at', { ascending: false })
    .limit(500)

  const lastCheckin: Record<string, { lat: number | null; lng: number | null; placeName: string | null; checkedInAt: string }> = {}
  for (const c of checkins || []) {
    if (!c.engineer_id || lastCheckin[c.engineer_id]) continue
    lastCheckin[c.engineer_id] = { lat: c.latitude, lng: c.longitude, placeName: c.place_name, checkedInAt: c.checked_in_at }
  }

  const ranked = engineers.map(e => {
    const ci = lastCheckin[e.id]
    const ping = lastSeenByEng[e.id]
    // Rank by whichever location is freshest — the passive app-open ping or the last
    // job check-in — not just the check-in, so an engineer who's moved since their
    // last visit isn't ranked from a stale position.
    const pingIsNewer = !!ping?.at && (!ci || new Date(ping.at) > new Date(ci.checkedInAt))
    const curLat = pingIsNewer ? ping!.lat : ci?.lat
    const curLng = pingIsNewer ? ping!.lng : ci?.lng
    const distanceKm = siteCoords && curLat != null && curLng != null
      ? haversineKm(siteCoords.lat, siteCoords.lng, curLat, curLng)
      : null
    return { ...e, distanceKm, lastCheckinPlace: ci?.placeName ?? null, lastCheckinAt: ci?.checkedInAt ?? null }
  })
  ranked.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0
    if (a.distanceKm == null) return 1
    if (b.distanceKm == null) return -1
    return a.distanceKm - b.distanceKm
  })
  return { engineers: ranked }
}

export interface EngineerScheduleEntry {
  workOrderId: string
  woNumber: string
  scheduledDate: string
  status: string
  customerName: string
  siteName: string | null
  placeLabel: string | null
}

// Upcoming work already on an engineer's plate, so an admin picking a scheduled
// date for a new/reassigned job can see what they'd be stacking it against instead
// of double-booking blind. "Upcoming" = has a scheduled date and isn't done or
// unassigned yet; excludeWorkOrderId keeps a job being rescheduled from showing up
// as a conflict against itself. placeLabel is read from customer_sites' cached
// geocode only (no live lookup here) — it's populated once that site has been
// geocoded via getSiteCoordinates, e.g. by being assigned through this same flow.
export async function getEngineerSchedule(engineerId: string, excludeWorkOrderId?: string): Promise<{ entries: EngineerScheduleEntry[] }> {
  const admin = adminClient()
  let query = admin
    .from('work_orders')
    .select('id, wo_number, scheduled_date, status, customers(name), work_order_transformers(transformers(customer_sites(site_name, place_label)))')
    .eq('engineer_id', engineerId)
    .not('scheduled_date', 'is', null)
    .in('status', ['assigned', 'in_progress', 'pending'])
    .order('scheduled_date', { ascending: true })
    .limit(10)
  if (excludeWorkOrderId) query = query.neq('id', excludeWorkOrderId)

  const { data } = await query

  type Row = {
    id: string; wo_number: string; scheduled_date: string; status: string
    customers: { name: string } | null
    work_order_transformers: { transformers: { customer_sites: { site_name: string; place_label: string | null } | null } | null }[]
  }
  return {
    entries: ((data as unknown as Row[]) || []).map(r => ({
      workOrderId: r.id,
      woNumber: r.wo_number,
      scheduledDate: r.scheduled_date,
      status: r.status,
      customerName: r.customers?.name || '',
      siteName: r.work_order_transformers?.[0]?.transformers?.customer_sites?.site_name || null,
      placeLabel: r.work_order_transformers?.[0]?.transformers?.customer_sites?.place_label || null,
    })),
  }
}

export async function getTransformersForCustomer(customerId: string): Promise<{ transformers: { id: string; serial_number: string; warranty_status: string; site_name: string | null }[] }> {
  const admin = adminClient()
  const { data } = await admin
    .from('transformers')
    .select('id, serial_number, warranty_status, customer_sites(site_name)')
    .eq('customer_id', customerId)
    .order('serial_number')

  type Row = { id: string; serial_number: string; warranty_status: string; customer_sites: { site_name: string } | null }
  return {
    transformers: ((data as unknown as Row[]) || []).map((r: Row) => ({
      id: r.id,
      serial_number: r.serial_number,
      warranty_status: r.warranty_status,
      site_name: r.customer_sites?.site_name || null,
    })),
  }
}
