'use server'

import { adminClient } from '@/lib/db/admin-client'

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
  }
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('transformers').update(fields).eq('id', transformerId)
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
