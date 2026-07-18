'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function addCustomer(payload: {
  name: string
  type: string
  contact_person: string
  phone: string
  email: string | null
  whatsapp_number: string | null
  address: string | null
  serial_number: string
  year_of_manufacture: string | null
  warranty_status: string
  site_name: string
  site_address: string
}): Promise<{ error: string | null; id?: string }> {
  try {
    const sb = adminClient()

    const { data: cust, error: ce } = await sb.from('customers').insert({
      name: payload.name,
      type: payload.type,
      contact_person: payload.contact_person,
      phone: payload.phone,
      email: payload.email,
      whatsapp_number: payload.whatsapp_number,
      address: payload.address,
    }).select().single()
    if (ce) return { error: ce.message }

    const { data: site, error: se } = await sb.from('customer_sites').insert({
      customer_id: cust.id,
      site_name: payload.site_name || payload.name,
      site_address: payload.site_address,
    }).select().single()
    if (se) return { error: se.message }

    const { error: te } = await sb.from('transformers').insert({
      customer_id: cust.id,
      site_id: site.id,
      serial_number: payload.serial_number,
      year_of_manufacture: payload.year_of_manufacture || null,
      warranty_status: payload.warranty_status,
    })
    if (te) return { error: te.message }

    // Create primary contact record
    await sb.from('customer_contacts').insert({
      customer_id: cust.id,
      name: payload.contact_person,
      phone: payload.phone,
      email: payload.email,
      whatsapp_number: payload.whatsapp_number,
      address: payload.address,
      is_primary: true,
    })

    return { error: null, id: cust.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateCustomer(
  customerId: string,
  payload: {
    name: string
    type: string
    contact_person: string
    phone: string
    email: string | null
    whatsapp_number: string | null
    address?: string | null
  }
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('customers').update(payload).eq('id', customerId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
