'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function addContact(payload: {
  customer_id: string
  site_id: string | null
  name: string
  designation: string | null
  phone: string | null
  email: string | null
  whatsapp_number: string | null
  address: string | null
  is_primary: boolean
}): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    if (payload.is_primary) {
      await sb.from('customer_contacts').update({ is_primary: false }).eq('customer_id', payload.customer_id)
    }
    const { error } = await sb.from('customer_contacts').insert(payload)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateContact(
  contactId: string,
  fields: {
    site_id: string | null
    name: string
    designation: string | null
    phone: string | null
    email: string | null
    whatsapp_number: string | null
    address: string | null
    is_primary: boolean
  },
  customerId: string
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    if (fields.is_primary) {
      await sb.from('customer_contacts').update({ is_primary: false }).eq('customer_id', customerId).neq('id', contactId)
    }
    const { error } = await sb.from('customer_contacts').update(fields).eq('id', contactId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteContact(contactId: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('customer_contacts').delete().eq('id', contactId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
