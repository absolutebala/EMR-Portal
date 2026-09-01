'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getAuthedUser } from '@/lib/cognito/server'

export async function addCustomer(payload: {
  name: string
  type: string
  contact_person: string
  phone: string
  email: string | null
  whatsapp_number: string | null
  address: string | null
  pincode: string
  end_customer_type_id: string | null
  serial_number: string
  year_of_manufacture: string | null
  warranty_status: string
  dispatch_date: string | null
  warranty_years: number | null
  site_name: string
  site_address: string
}): Promise<{ error: string | null; id?: string }> {
  try {
    if (!/^\d{6}$/.test(payload.pincode)) return { error: 'Enter a valid 6-digit pincode' }

    const sb = adminClient()

    const { data: cust, error: ce } = await sb.from('customers').insert({
      name: payload.name,
      type: payload.type,
      contact_person: payload.contact_person,
      phone: payload.phone,
      email: payload.email,
      whatsapp_number: payload.whatsapp_number,
      address: payload.address,
      pincode: payload.pincode,
      end_customer_type_id: payload.end_customer_type_id,
    }).select().single()
    if (ce) return { error: ce.message }

    // site_address is NOT NULL — falls back to the customer's own general address
    // (mirroring the site_name -> customer name fallback) since the form only
    // requires site_address once a site_name has actually been entered.
    const { data: site, error: se } = await sb.from('customer_sites').insert({
      customer_id: cust.id,
      site_name: payload.site_name || payload.name,
      site_address: payload.site_address || payload.address || '',
    }).select().single()
    if (se) return { error: se.message }

    // Serial number is optional — a customer can be added before any transformer's
    // serial number is known (e.g. an Overhauling notification opened ahead of the
    // site visit). serial_number is unique + not null on transformers, so skip the
    // insert entirely rather than writing a blank placeholder.
    if (payload.serial_number.trim()) {
      const { error: te } = await sb.from('transformers').insert({
        customer_id: cust.id,
        site_id: site.id,
        serial_number: payload.serial_number.trim(),
        year_of_manufacture: payload.year_of_manufacture || null,
        warranty_status: payload.warranty_status,
        dispatch_date: payload.dispatch_date || null,
        warranty_years: payload.warranty_years,
      })
      if (te) return { error: te.message }
    }

    // Create primary contact record, linked to the site just created — this is the
    // on-site contact for that site, not just a general customer-level contact.
    await sb.from('customer_contacts').insert({
      customer_id: cust.id,
      site_id: site.id,
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
    // Optional here (unlike addCustomer, where it's required) — not every edit surface
    // in the app touches pincode/end customer type, and forcing them to would block
    // saves on screens that were never asked to collect these fields.
    pincode?: string
    end_customer_type_id?: string | null
  }
): Promise<{ error: string | null }> {
  try {
    if (payload.pincode !== undefined && !/^\d{6}$/.test(payload.pincode)) return { error: 'Enter a valid 6-digit pincode' }

    const sb = adminClient()
    const { error } = await sb.from('customers').update(payload).eq('id', customerId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export interface BlockingNotification {
  id: string
  woNumber: string
}

// cascade=false (default): if any notifications reference this customer, don't delete —
// return them (id + number) so the UI can list them as links and ask the admin whether
// to remove them too. cascade=true: delete those notifications first (their own child
// rows cascade), then the customer.
export async function deleteCustomer(
  customerId: string,
  options?: { cascade?: boolean }
): Promise<{ error: string | null; blockingNotifications?: BlockingNotification[] }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated.' }

    const sb = adminClient()
    const { data: actor } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (actor?.role !== 'Super Admin' && actor?.role !== 'Head of Service') {
      return { error: 'Only Super Admin or Head of Service can delete customers.' }
    }

    // work_orders.customer_id is ON DELETE RESTRICT (unlike customer_sites/transformers/
    // customer_contacts, which cascade), so a customer with notifications can't be
    // deleted outright. Fetch the referencing ones up front — either to hand back to the
    // UI (cascade off) or to delete first (cascade on).
    const { data: refRows } = await sb.from('work_orders').select('id, wo_number').eq('customer_id', customerId)
    const blocking = (refRows || []).map(r => ({ id: r.id as string, woNumber: (r.wo_number as string) || '—' }))

    if (blocking.length > 0) {
      if (!options?.cascade) {
        return { error: null, blockingNotifications: blocking }
      }
      // Cascade: delete the referencing notifications first (each cascades its own
      // check-ins/closures/forms/etc.), which lifts the RESTRICT on the customer.
      const { error: woErr } = await sb.from('work_orders').delete().in('id', blocking.map(b => b.id))
      if (woErr) return { error: woErr.message }
    }

    const { error } = await sb.from('customers').delete().eq('id', customerId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
