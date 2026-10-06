'use server'

import { adminClient } from '@/lib/db/admin-client'

// Baseline warranty expiry from dispatch date + warranty years. Extend/Renew later push
// this date forward; here it just seeds a value when both inputs are present.
function computeExpiry(dispatchDate: string | null, warrantyYears: number | null): string | null {
  if (!dispatchDate || warrantyYears == null) return null
  const d = new Date(dispatchDate + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  d.setFullYear(d.getFullYear() + warrantyYears)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function addTransformer(payload: {
  customer_id: string
  site_id: string | null
  new_site_name?: string
  new_site_address?: string
  serial_number: string
  rating: string | null
  manufacturer: string | null
  year_of_manufacture: string | null
  warranty_status: string
  dispatch_date: string | null
  warranty_years: number | null
  notes?: string | null
}): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    let siteId = payload.site_id

    if (!siteId && payload.new_site_address) {
      const { data: site, error: se } = await sb.from('customer_sites').insert({
        customer_id: payload.customer_id,
        site_name: payload.new_site_name || 'Site',
        site_address: payload.new_site_address,
      }).select().single()
      if (se) return { error: se.message }
      siteId = site.id
    }

    const { error } = await sb.from('transformers').insert({
      customer_id: payload.customer_id,
      site_id: siteId,
      serial_number: payload.serial_number,
      rating: payload.rating || null,
      manufacturer: payload.manufacturer || null,
      year_of_manufacture: payload.year_of_manufacture || null,
      warranty_status: payload.warranty_status,
      dispatch_date: payload.dispatch_date || null,
      warranty_years: payload.warranty_years,
      warranty_expiry_date: computeExpiry(payload.dispatch_date || null, payload.warranty_years),
      notes: payload.notes || null,
    })
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateTransformer(
  transformerId: string,
  fields: {
    serial_number: string
    rating: string | null
    manufacturer: string | null
    year_of_manufacture: string | null
    warranty_status: string
    site_id: string | null
    dispatch_date: string | null
    warranty_years: number | null
    notes?: string | null
  }
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    // Seed warranty_expiry_date from dispatch + years only if it isn't already set —
    // never overwrite an expiry that an extend/renew has already pushed forward.
    const { data: current } = await sb.from('transformers').select('warranty_expiry_date').eq('id', transformerId).maybeSingle()
    const patch: Record<string, unknown> = { ...fields }
    if (!current?.warranty_expiry_date) {
      patch.warranty_expiry_date = computeExpiry(fields.dispatch_date, fields.warranty_years)
    }
    const { error } = await sb.from('transformers').update(patch).eq('id', transformerId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteTransformer(transformerId: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('transformers').delete().eq('id', transformerId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
