'use server'

import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import { sendWhatsApp } from '@/lib/messaging/whatsapp'
import { adminClient } from '@/lib/mobile/core/shared'
import { getMyDepartmentScope } from './departments'
import {
  fetchRequestViews, searchProductsCore, submitProductRequestCore, getMyProductRequestsCore,
  type Product, type ProductRequestView,
} from '@/lib/mobile/core/products'
// NOTE: Product, ProductRequestView, ProductRequestItemView now live in
// lib/mobile/core/products.ts — import them from there directly, not from this file
// (same 'use server' type re-export constraint as elsewhere in this codebase).

// ---------- Catalog (admin) ----------

export async function getProductsCatalog(): Promise<{ products: Product[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin.from('products').select('id, name, sap_code, hierarchy, level_1').order('name')
    if (error) return { products: [], error: error.message }
    return { products: data || [], error: null }
  } catch (e: unknown) {
    return { products: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createProduct(params: { name: string; sapCode: string | null; hierarchy: string | null; level1: string | null }): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('products').insert({
      name: params.name, sap_code: params.sapCode, hierarchy: params.hierarchy, level_1: params.level1,
    })
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    logActivity(admin, { actorId: user.id, actorName, action: `Added product "${params.name}" to catalog`, entityType: 'product' }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateProduct(id: string, params: { name: string; sapCode: string | null; hierarchy: string | null; level1: string | null }): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('products').update({
      name: params.name, sap_code: params.sapCode, hierarchy: params.hierarchy, level_1: params.level1,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteProduct(id: string): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
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
// searchProducts, submitProductRequest, getMyProductRequests are now thin wrappers
// over lib/mobile/core/products.ts — business logic lives there, shared with the RN
// REST routes.

export async function searchProducts(query: string) {
  return searchProductsCore(adminClient(), query)
}

export async function submitProductRequest(params: {
  workOrderId: string
  items: { productId: string; quantity: number }[]
  damagePhotos: { base64: string; mimeType: string; ext: string }[]
}) {
  const user = await getAuthedUser()
  if (!user) return { error: 'Not authenticated' }
  return submitProductRequestCore(adminClient(), user.id, params)
}

export async function getMyProductRequests() {
  const user = await getAuthedUser()
  if (!user) return { requests: [], error: 'Not authenticated' }
  return getMyProductRequestsCore(adminClient(), user.id)
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

export async function getProductRequestsForEngineer(engineerId: string): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: reqIds } = await admin.from('product_requests').select('id').eq('engineer_id', engineerId).order('created_at', { ascending: false })
    const requests = await fetchRequestViews(admin, (reqIds || []).map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAllProductRequests(): Promise<{ requests: ProductRequestView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const departmentScope = await getMyDepartmentScope()
    const { data: reqRows } = await admin.from('product_requests').select('id, work_order_id').order('created_at', { ascending: false })
    let scopedRows = reqRows || []
    if (departmentScope && scopedRows.length) {
      const woIds = [...new Set(scopedRows.map(r => r.work_order_id))]
      const { data: wos } = await admin.from('work_orders').select('id, department_id').in('id', woIds)
      const scopedWoIds = new Set((wos || []).filter(w => departmentScope.includes(w.department_id || '')).map(w => w.id))
      scopedRows = scopedRows.filter(r => scopedWoIds.has(r.work_order_id))
    }
    const requests = await fetchRequestViews(admin, scopedRows.map(r => r.id))
    return { requests, error: null }
  } catch (e: unknown) {
    return { requests: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateProductRequestItemStatus(
  itemId: string,
  status: 'approved' | 'rejected' | 'dispatched' | 'delivered',
  extra?: { deliveryEstimate?: string | null; notes?: string | null }
): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const patch: Record<string, unknown> = { status }
    if (status === 'approved') { patch.approved_by = user.id; patch.approved_at = new Date().toISOString() }
    if (status === 'dispatched') { patch.dispatched_at = new Date().toISOString() }
    if (status === 'delivered') { patch.delivered_at = new Date().toISOString() }
    if (extra?.deliveryEstimate !== undefined) patch.delivery_estimate = extra.deliveryEstimate
    if (extra?.notes !== undefined) patch.admin_notes = extra.notes

    const { data: item } = await admin.from('product_request_items').select('request_id, products(name)').eq('id', itemId).maybeSingle()

    const { error } = await admin.from('product_request_items').update(patch).eq('id', itemId)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const label: Record<string, string> = { approved: 'Approved', rejected: 'Rejected', dispatched: 'Marked dispatched for', delivered: 'Marked delivered for' }
    logActivity(admin, { actorId: user.id, actorName, action: `${label[status]} product request item`, entityType: 'product_request_item', entityId: itemId }).catch(() => {})

    if (item?.request_id) {
      const { data: reqRow } = await admin.from('product_requests').select('engineer_id, work_order_id').eq('id', item.request_id).maybeSingle()
      if (reqRow?.engineer_id) {
        notifyUsers(admin, [{ userId: reqRow.engineer_id }], {
          type: 'product_request_status',
          title: `Product request ${status}`,
          body: `${actorName} ${label[status].toLowerCase()} an item in your product request.`,
          entityType: 'product_request_item', entityId: itemId,
          linkPath: reqRow.work_order_id ? `/mobile/work-orders/${reqRow.work_order_id}` : '/mobile/requests',
        }).catch(() => {})

        const [{ data: eng }, { data: wo }] = await Promise.all([
          admin.from('profiles').select('first_name, phone').eq('id', reqRow.engineer_id).maybeSingle(),
          admin.from('work_orders').select('wo_number').eq('id', reqRow.work_order_id).maybeSingle(),
        ])
        const productName = item.products?.[0]?.name || 'item'
        sendWhatsApp(admin, 'product_request', [{ phone: eng?.phone, userName: eng?.first_name || 'Engineer' }],
          [eng?.first_name || 'Engineer', wo?.wo_number || '', label[status], productName]).catch(() => {})
      }
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
