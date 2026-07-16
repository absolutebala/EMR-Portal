'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import type { WorkOrder } from '@/lib/types'
import type { MobileFormSection, MobileFormField, MobileFormTable, MobileFormRow } from '@/app/actions/mobile-actions'

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

    const [{ data: wotRows }, { data: customers }, { data: engineers }] = await Promise.all([
      admin.from('work_order_transformers').select('work_order_id, transformer_id, transformers(serial_number, warranty_status, site_id, customer_sites(site_name))').in('work_order_id', woIds),
      admin.from('customers').select('id, name').in('id', customerIds),
      engineerIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds) : Promise.resolve({ data: [] }),
    ])

    const custMap: Record<string, string> = {}
    customers?.forEach((c: { id: string; name: string }) => { custMap[c.id] = c.name })

    const engMap: Record<string, string> = {}
    engineers?.forEach((e: { id: string; first_name: string; last_name: string }) => { engMap[e.id] = `${e.first_name} ${e.last_name}` })

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

    const [{ data: customer }, { data: engineer }, { data: checkinRow }, { data: closureRow }, { data: formRow }, { data: allCheckins }, { data: allClosures }] = await Promise.all([
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
        .select('id, outcome, summary, pending_reason, materials_required, revisit_date, needs_reassignment, engineer_signature, client_name, client_signature, pdf_url, sent_to_sap, engineer_id, created_at')
        .eq('work_order_id', id)
        .order('created_at', { ascending: true }),
    ])

    // Build a date-wise visit history: each closure marks the end of a
    // check-in → closure cycle, so pair every closure with the check-in(s)
    // that happened before it (most recent one wins). Any check-ins left over
    // after the last closure represent the visit currently in progress.
    type CheckinRow = { latitude: number | null; longitude: number | null; place_name: string | null; photo_url: string | null; checked_in_at: string }
    type ClosureRow = {
      id: string; outcome: string; summary: string; pending_reason: string | null; materials_required: string | null
      revisit_date: string | null; needs_reassignment: boolean; engineer_signature: string | null
      client_name: string | null; client_signature: string | null; pdf_url: string | null; sent_to_sap: boolean
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

export async function getAssignableEngineers(): Promise<{ engineers: { id: string; first_name: string; last_name: string; role: string }[] }> {
  const admin = adminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, role')
    .eq('role', 'Field Engineer')
    .order('first_name')
  return { engineers: data || [] }
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
