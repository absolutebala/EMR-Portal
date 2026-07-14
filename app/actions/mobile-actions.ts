'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
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

export async function getMobileWorkOrders(): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string } | null; error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { workOrders: [], engineer: null, error: 'Not authenticated' }

    const admin = adminClient()

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const { data: wos, error } = await admin
      .from('work_orders')
      .select('*')
      .eq('engineer_id', user.id)
      .not('status', 'eq', 'completed')
      .order('scheduled_date', { ascending: true })

    if (error) return { workOrders: [], engineer: null, error: error.message }
    if (!wos?.length) return { workOrders: [], engineer: profile ? { name: `${profile.first_name} ${profile.last_name}` } : null, error: null }

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

    const workOrders: MobileWorkOrder[] = wos.map((w: { id: string; wo_number: string; job_type: string; status: string; scheduled_date: string | null; notes: string | null; customer_id: string }) => {
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

    return {
      workOrders,
      engineer: profile ? { name: `${profile.first_name} ${profile.last_name}` } : null,
      error: null,
    }
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

    const { data: wo, error: woErr } = await admin
      .from('work_orders')
      .select('*')
      .eq('id', woId)
      .single()
    if (woErr || !wo) return { workOrder: null, form: null, existingSubmission: null, error: 'Work order not found' }

    const [{ data: wotRows }, { data: customer }] = await Promise.all([
      admin.from('work_order_transformers')
        .select('transformer_id, transformers(serial_number, customer_sites(site_name))')
        .eq('work_order_id', woId),
      admin.from('customers').select('name').eq('id', wo.customer_id).single(),
    ])

    type WotRow = { transformers: { serial_number: string; customer_sites: { site_name: string } | null } | null }
    const rows = (wotRows as unknown as WotRow[]) || []
    const workOrder: MobileWorkOrder = {
      id: wo.id,
      wo_number: wo.wo_number,
      job_type: wo.job_type,
      status: wo.status,
      scheduled_date: wo.scheduled_date,
      notes: wo.notes,
      customer_name: customer?.name || '',
      serial_numbers: rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[],
      site_name: rows[0]?.transformers?.customer_sites?.site_name || null,
    }

    // Find the active form for this job type
    const { data: formRow } = await admin
      .from('forms')
      .select('id, name, job_type')
      .eq('job_type', wo.job_type)
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
