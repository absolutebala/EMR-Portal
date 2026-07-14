'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'
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
  createdAt: string
}

export interface WorkOrderSubmittedForm {
  formName: string
  submittedAt: string | null
  sections: MobileFormSection[]
  fieldValues: Record<string, string>
  rowValues: Record<string, { status: string; remarks: string }>
}

export interface WorkOrderVisit {
  id: string
  visitType: 'followup' | 'final'
  engineerName: string
  clientName: string | null
  engineerSignature: string | null
  clientSignature: string | null
  pdfUrl: string | null
  sentToSap: boolean
  createdAt: string
}

export async function getWorkOrders(): Promise<{ workOrders: WorkOrder[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
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

    // Service Engineers see only their assigned work orders
    const filtered = role === 'Service Engineer'
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
      admin.from('work_order_activity').select('action, actor_name, created_at').eq('work_order_id', id).order('created_at', { ascending: true }),
    ])

    if (!wo) return { ...empty, error: 'Not found' }

    const [{ data: customer }, { data: engineer }, { data: checkinRow }, { data: closureRow }, { data: formRow }, { data: visitRows }] = await Promise.all([
      admin.from('customers').select('name').eq('id', wo.customer_id).single(),
      wo.engineer_id ? admin.from('profiles').select('first_name, last_name').eq('id', wo.engineer_id).single() : Promise.resolve({ data: null }),
      admin.from('work_order_checkins').select('latitude, longitude, place_name, photo_url, checked_in_at').eq('work_order_id', id).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('work_order_daily_closures').select('outcome, summary, pending_reason, materials_required, revisit_date, created_at').eq('work_order_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('forms').select('id, name').eq('job_type', wo.job_type).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('work_order_visits')
        .select('id, visit_type, client_name, engineer_signature, client_signature, pdf_url, sent_to_sap, created_at, profiles(first_name, last_name)')
        .eq('work_order_id', id)
        .order('created_at', { ascending: false }),
    ])

    type VisitEmbed = {
      id: string; visit_type: 'followup' | 'final'; client_name: string | null
      engineer_signature: string | null; client_signature: string | null
      pdf_url: string | null; sent_to_sap: boolean; created_at: string
      profiles: { first_name: string; last_name: string } | null
    }
    const visits: WorkOrderVisit[] = ((visitRows as unknown as VisitEmbed[]) || []).map(v => ({
      id: v.id,
      visitType: v.visit_type,
      engineerName: v.profiles ? `${v.profiles.first_name} ${v.profiles.last_name}` : 'Engineer',
      clientName: v.client_name,
      engineerSignature: v.engineer_signature,
      clientSignature: v.client_signature,
      pdfUrl: v.pdf_url,
      sentToSap: v.sent_to_sap,
      createdAt: v.created_at,
    }))

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
    .eq('role', 'Service Engineer')
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
