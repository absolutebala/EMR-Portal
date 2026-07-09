'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'
import type { WorkOrder } from '@/lib/types'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
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

export async function getWorkOrderDetail(id: string): Promise<{ workOrder: WorkOrder | null; activity: { action: string; actor_name: string | null; created_at: string }[]; error: string | null }> {
  try {
    const admin = adminClient()
    const [{ data: wo }, { data: wotRows }, { data: actRows }] = await Promise.all([
      admin.from('work_orders').select('*').eq('id', id).single(),
      admin.from('work_order_transformers').select('work_order_id, transformer_id, transformers(serial_number, warranty_status, customer_sites(site_name))').eq('work_order_id', id),
      admin.from('work_order_activity').select('action, actor_name, created_at').eq('work_order_id', id).order('created_at', { ascending: true }),
    ])

    if (!wo) return { workOrder: null, activity: [], error: 'Not found' }

    const [{ data: customer }, { data: engineer }] = await Promise.all([
      admin.from('customers').select('name').eq('id', wo.customer_id).single(),
      wo.engineer_id ? admin.from('profiles').select('first_name, last_name').eq('id', wo.engineer_id).single() : Promise.resolve({ data: null }),
    ])

    type WotRow = { work_order_id: string; transformer_id: string; transformers: { serial_number: string; warranty_status: string; customer_sites: { site_name: string } | null } | null }
    const rows = (wotRows as unknown as WotRow[]) || []
    const serialNumbers = rows.map(r => r.transformers?.serial_number).filter(Boolean) as string[]
    const hasWarranty = rows.some(r => r.transformers?.warranty_status === 'under_warranty')
    const siteName = rows[0]?.transformers?.customer_sites?.site_name || null

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
      error: null,
    }
  } catch (e: unknown) {
    return { workOrder: null, activity: [], error: e instanceof Error ? e.message : String(e) }
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
    .in('role', ['Service Engineer', 'Service Manager'])
    .eq('is_active', true)
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
