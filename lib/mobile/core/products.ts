import { logActivity } from '@/lib/activity-log'
import { type AdminClient, withTimeout, storageAdminClient } from './shared'

export interface Product {
  id: string
  name: string
  sap_code: string | null
  stock_qty: number
}

export interface ProductRequestItemView {
  id: string
  productName: string
  sapCode: string | null
  quantity: number
  status: 'pending' | 'approved' | 'rejected' | 'dispatched' | 'delivered'
  approverName: string | null
  approvedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
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

// Shared with the desktop-only request views in app/actions/products.ts (admin
// review, per-engineer profile page) — kept there since those callers aren't part of
// the mobile app, but the row-shaping logic itself lives here so the mobile "my
// requests" list and the desktop views never drift apart on how a row is built.
export async function fetchRequestViews(admin: AdminClient, requestIds: string[]): Promise<ProductRequestView[]> {
  if (!requestIds.length) return []

  const [{ data: requests }, { data: items }] = await Promise.all([
    admin.from('product_requests').select('id, work_order_id, engineer_id, damage_photo_urls, created_at, work_orders(wo_number)').in('id', requestIds),
    admin.from('product_request_items').select('id, request_id, product_id, quantity, status, approved_by, approved_at, dispatched_at, delivered_at, delivery_estimate, admin_notes').in('request_id', requestIds),
  ])

  type ReqRow = { id: string; work_order_id: string; engineer_id: string | null; damage_photo_urls: string[]; created_at: string; work_orders: { wo_number: string } | null }
  type ItemRow = {
    id: string; request_id: string; product_id: string; quantity: number; status: string
    approved_by: string | null; approved_at: string | null; dispatched_at: string | null; delivered_at: string | null; delivery_estimate: string | null; admin_notes: string | null
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
      deliveredAt: it.delivered_at,
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

// Empty/blank query returns an initial browse list (e.g. on tapping the field before
// typing anything) instead of nothing — only an actual query string filters it down.
export async function searchProductsCore(admin: AdminClient, query: string): Promise<{ products: Product[]; error: string | null }> {
  try {
    let q = admin.from('products').select('id, name, sap_code, stock_qty').order('name').limit(20)
    const trimmed = query.trim()
    if (trimmed) q = q.or(`name.ilike.%${trimmed}%,sap_code.ilike.%${trimmed}%`)
    const { data, error } = await q
    if (error) return { products: [], error: error.message }
    return { products: data || [], error: null }
  } catch (e: unknown) {
    return { products: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function submitProductRequestCore(admin: AdminClient, userId: string, params: {
  workOrderId: string
  items: { productId: string; quantity: number }[]
  damagePhotos: { base64: string; mimeType: string; ext: string }[]
}): Promise<{ error: string | null }> {
  try {
    if (!params.items.length) return { error: 'Add at least one product to the request' }
    if (!params.damagePhotos.length) return { error: 'At least one damaged-product photo is required' }

    // Uploaded in parallel — a sequential for-loop here is what made submission feel
    // like it hung on a slow connection with more than one photo (each upload has up
    // to a 25s timeout).
    const uploadResults = await Promise.all(params.damagePhotos.map(async (photo, i) => {
      const base64 = photo.base64.split(',')[1] ?? photo.base64
      const buffer = Buffer.from(base64, 'base64')
      const path = `product-requests/${params.workOrderId}-${Date.now()}-${i}.${photo.ext}`
      const upResult = await withTimeout(
        storageAdminClient().storage.from('assets').upload(path, buffer, { upsert: true, contentType: photo.mimeType }),
        25000
      )
      if (upResult && !upResult.error) return storageAdminClient().storage.from('assets').getPublicUrl(path).data.publicUrl
      console.error('submitProductRequest: damage photo upload failed', upResult?.error)
      return null
    }))
    const photoUrls = uploadResults.filter((u): u is string => !!u)
    if (!photoUrls.length) return { error: 'Photo upload failed — please check your connection and try again.' }

    const { data: request, error: reqError } = await admin.from('product_requests').insert({
      work_order_id: params.workOrderId,
      engineer_id: userId,
      damage_photo_urls: photoUrls,
    }).select('id').single()
    if (reqError || !request) return { error: reqError?.message || 'Could not create request' }

    const [{ error: itemsError }, { data: actor }, { data: wo }] = await Promise.all([
      admin.from('product_request_items').insert(
        params.items.map(i => ({ request_id: request.id, product_id: i.productId, quantity: i.quantity }))
      ),
      admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle(),
      admin.from('work_orders').select('wo_number').eq('id', params.workOrderId).maybeSingle(),
    ])
    if (itemsError) return { error: itemsError.message }

    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    logActivity(admin, {
      actorId: userId, actorName,
      action: `Requested ${params.items.length} product${params.items.length > 1 ? 's' : ''} for notification ${wo?.wo_number || ''}`,
      entityType: 'product_request', entityId: request.id,
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMyProductRequestsCore(admin: AdminClient, userId: string): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const { data: reqIds } = await admin.from('product_requests').select('id').eq('engineer_id', userId)
    const requests = await fetchRequestViews(admin, (reqIds || []).map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}
