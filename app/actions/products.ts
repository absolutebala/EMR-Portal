'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

export interface Product {
  id: string
  name: string
  sap_code: string | null
  stock_qty: number
}

// ---------- Catalog (admin) ----------

export async function getProductsCatalog(): Promise<{ products: Product[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin.from('products').select('id, name, sap_code, stock_qty').order('name')
    if (error) return { products: [], error: error.message }
    return { products: data || [], error: null }
  } catch (e: unknown) {
    return { products: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createProduct(params: { name: string; sapCode: string | null; stockQty: number }): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('products').insert({ name: params.name, sap_code: params.sapCode, stock_qty: params.stockQty })
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    logActivity(admin, { actorId: user.id, actorName, action: `Added product "${params.name}" to catalog`, entityType: 'product' }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateProduct(id: string, params: { name: string; sapCode: string | null; stockQty: number }): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('products').update({
      name: params.name, sap_code: params.sapCode, stock_qty: params.stockQty, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteProduct(id: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('products').delete().eq('id', id)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------- Requests (mobile: submit + my requests) ----------

export interface ProductRequestItemView {
  id: string
  productName: string
  sapCode: string | null
  quantity: number
  status: 'pending' | 'approved' | 'rejected' | 'dispatched'
  approverName: string | null
  approvedAt: string | null
  dispatchedAt: string | null
  deliveryEstimate: string | null
  adminNotes: string | null
}

export interface ProductRequestView {
  id: string
  workOrderId: string
  woNumber: string
  createdAt: string
  damagePhotoUrls: string[]
  items: ProductRequestItemView[]
  engineerName?: string
}

async function fetchRequestViews(admin: ReturnType<typeof adminClient>, requestIds: string[]): Promise<ProductRequestView[]> {
  if (!requestIds.length) return []

  const [{ data: requests }, { data: items }] = await Promise.all([
    admin.from('product_requests').select('id, work_order_id, engineer_id, damage_photo_urls, created_at, work_orders(wo_number)').in('id', requestIds),
    admin.from('product_request_items').select('id, request_id, product_id, quantity, status, approved_by, approved_at, dispatched_at, delivery_estimate, admin_notes').in('request_id', requestIds),
  ])

  type ReqRow = { id: string; work_order_id: string; engineer_id: string | null; damage_photo_urls: string[]; created_at: string; work_orders: { wo_number: string } | null }
  type ItemRow = {
    id: string; request_id: string; product_id: string; quantity: number; status: string
    approved_by: string | null; approved_at: string | null; dispatched_at: string | null; delivery_estimate: string | null; admin_notes: string | null
  }
  const reqRows = (requests as unknown as ReqRow[]) || []
  const itemRows = (items as unknown as ItemRow[]) || []

  const productIds = [...new Set(itemRows.map(r => r.product_id))]
  const approverIds = [...new Set(itemRows.map(r => r.approved_by).filter(Boolean))] as string[]
  const engineerIds = [...new Set(reqRows.map(r => r.engineer_id).filter(Boolean))] as string[]

  const [{ data: products }, { data: approvers }, { data: engineers }] = await Promise.all([
    productIds.length ? admin.from('products').select('id, name, sap_code').in('id', productIds) : Promise.resolve({ data: [] as { id: string; name: string; sap_code: string | null }[] }),
    approverIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', approverIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    engineerIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ])

  const productMap: Record<string, { name: string; sap_code: string | null }> = {}
  ;(products || []).forEach(p => { productMap[p.id] = { name: p.name, sap_code: p.sap_code } })
  const nameMap: Record<string, string> = {}
  ;[...(approvers || []), ...(engineers || [])].forEach(p => { nameMap[p.id] = `${p.first_name} ${p.last_name}` })

  const itemsByRequest: Record<string, ProductRequestItemView[]> = {}
  for (const it of itemRows) {
    if (!itemsByRequest[it.request_id]) itemsByRequest[it.request_id] = []
    itemsByRequest[it.request_id].push({
      id: it.id,
      productName: productMap[it.product_id]?.name || 'Unknown product',
      sapCode: productMap[it.product_id]?.sap_code ?? null,
      quantity: it.quantity,
      status: it.status as ProductRequestItemView['status'],
      approverName: it.approved_by ? (nameMap[it.approved_by] || null) : null,
      approvedAt: it.approved_at,
      dispatchedAt: it.dispatched_at,
      deliveryEstimate: it.delivery_estimate,
      adminNotes: it.admin_notes,
    })
  }

  return reqRows
    .map(r => ({
      id: r.id,
      workOrderId: r.work_order_id,
      woNumber: r.work_orders?.wo_number || '',
      createdAt: r.created_at,
      damagePhotoUrls: r.damage_photo_urls || [],
      items: itemsByRequest[r.id] || [],
      engineerName: r.engineer_id ? (nameMap[r.engineer_id] || 'Engineer') : undefined,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export async function searchProducts(query: string): Promise<{ products: Product[]; error: string | null }> {
  try {
    if (query.trim().length < 2) return { products: [], error: null }
    const admin = adminClient()
    const { data, error } = await admin
      .from('products')
      .select('id, name, sap_code, stock_qty')
      .or(`name.ilike.%${query}%,sap_code.ilike.%${query}%`)
      .order('name')
      .limit(20)
    if (error) return { products: [], error: error.message }
    return { products: data || [], error: null }
  } catch (e: unknown) {
    return { products: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function submitProductRequest(params: {
  workOrderId: string
  items: { productId: string; quantity: number }[]
  damagePhotos: { base64: string; mimeType: string; ext: string }[]
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }
    if (!params.items.length) return { error: 'Add at least one product to the request' }
    if (!params.damagePhotos.length) return { error: 'At least one damaged-product photo is required' }

    const admin = adminClient()

    const photoUrls: string[] = []
    for (const photo of params.damagePhotos) {
      const base64 = photo.base64.split(',')[1] ?? photo.base64
      const buffer = Buffer.from(base64, 'base64')
      const path = `product-requests/${params.workOrderId}-${Date.now()}-${photoUrls.length}.${photo.ext}`
      const upResult = await withTimeout(
        admin.storage.from('assets').upload(path, buffer, { upsert: true, contentType: photo.mimeType }),
        25000
      )
      if (upResult && !upResult.error) {
        photoUrls.push(admin.storage.from('assets').getPublicUrl(path).data.publicUrl)
      } else {
        console.error('submitProductRequest: damage photo upload failed', upResult?.error)
      }
    }
    if (!photoUrls.length) return { error: 'Photo upload failed — please check your connection and try again.' }

    const { data: request, error: reqError } = await admin.from('product_requests').insert({
      work_order_id: params.workOrderId,
      engineer_id: user.id,
      damage_photo_urls: photoUrls,
    }).select('id').single()
    if (reqError || !request) return { error: reqError?.message || 'Could not create request' }

    const { error: itemsError } = await admin.from('product_request_items').insert(
      params.items.map(i => ({ request_id: request.id, product_id: i.productId, quantity: i.quantity }))
    )
    if (itemsError) return { error: itemsError.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    const { data: wo } = await admin.from('work_orders').select('wo_number').eq('id', params.workOrderId).maybeSingle()
    logActivity(admin, {
      actorId: user.id, actorName,
      action: `Requested ${params.items.length} product${params.items.length > 1 ? 's' : ''} for notification ${wo?.wo_number || ''}`,
      entityType: 'product_request', entityId: request.id,
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMyProductRequests(): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { requests: [], error: 'Not authenticated' }

    const admin = adminClient()
    const { data: reqIds } = await admin.from('product_requests').select('id').eq('engineer_id', user.id)
    const requests = await fetchRequestViews(admin, (reqIds || []).map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------- Desktop: per-notification + admin review ----------

export async function getProductRequestsForWorkOrder(workOrderId: string): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: reqIds } = await admin.from('product_requests').select('id').eq('work_order_id', workOrderId)
    const requests = await fetchRequestViews(admin, (reqIds || []).map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAllProductRequests(): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: reqIds } = await admin.from('product_requests').select('id').order('created_at', { ascending: false })
    const requests = await fetchRequestViews(admin, (reqIds || []).map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateProductRequestItemStatus(
  itemId: string,
  status: 'approved' | 'rejected' | 'dispatched',
  extra?: { deliveryEstimate?: string | null; notes?: string | null }
): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const patch: Record<string, unknown> = { status }
    if (status === 'approved') { patch.approved_by = user.id; patch.approved_at = new Date().toISOString() }
    if (status === 'dispatched') { patch.dispatched_at = new Date().toISOString() }
    if (extra?.deliveryEstimate !== undefined) patch.delivery_estimate = extra.deliveryEstimate
    if (extra?.notes !== undefined) patch.admin_notes = extra.notes

    const { error } = await admin.from('product_request_items').update(patch).eq('id', itemId)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const label: Record<string, string> = { approved: 'Approved', rejected: 'Rejected', dispatched: 'Marked dispatched for' }
    logActivity(admin, { actorId: user.id, actorName, action: `${label[status]} product request item`, entityType: 'product_request_item', entityId: itemId }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
