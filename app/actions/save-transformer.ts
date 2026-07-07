'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
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
