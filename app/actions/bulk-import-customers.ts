'use server'

import { adminClient } from '@/lib/db/admin-client'

export interface BulkCustomerRow {
  name: string
  type: string
  contact_person: string
  phone: string
  email: string
  whatsapp_number: string
  address: string
  site_name: string
  site_address: string
  serial_number: string
  year_of_manufacture: string
  warranty_status: string
}

export interface BulkCustomerResult {
  name: string
  status: 'success' | 'error'
  error?: string
}

// Same 4-insert sequence as addCustomer() in save-customer.ts (customer -> site ->
// transformer -> primary contact), looped per row with its own duplicate checks —
// customers.name has no DB-level uniqueness, so that check is app-layer only, but
// transformers.serial_number is a real UNIQUE constraint, so checking it up front
// gives a clean per-row error instead of a raw constraint-violation message.
export async function bulkImportCustomers(rows: BulkCustomerRow[]): Promise<BulkCustomerResult[]> {
  const admin = adminClient()
  const results: BulkCustomerResult[] = []

  for (const row of rows) {
    const { data: existingCust } = await admin.from('customers').select('id').ilike('name', row.name).maybeSingle()
    if (existingCust) {
      results.push({ name: row.name, status: 'error', error: `Customer "${row.name}" already exists.` })
      continue
    }

    const { data: existingSerial } = await admin.from('transformers').select('id').eq('serial_number', row.serial_number).maybeSingle()
    if (existingSerial) {
      results.push({ name: row.name, status: 'error', error: `Serial number "${row.serial_number}" is already in use.` })
      continue
    }

    const { data: cust, error: ce } = await admin.from('customers').insert({
      name: row.name,
      type: row.type || 'both',
      contact_person: row.contact_person,
      phone: row.phone,
      email: row.email || null,
      whatsapp_number: row.whatsapp_number || null,
      address: row.address || null,
    }).select().single()
    if (ce || !cust) {
      results.push({ name: row.name, status: 'error', error: ce?.message || 'Could not create customer' })
      continue
    }

    const { data: site, error: se } = await admin.from('customer_sites').insert({
      customer_id: cust.id,
      site_name: row.site_name || row.name,
      site_address: row.site_address || row.address || '',
    }).select().single()
    if (se || !site) {
      results.push({ name: row.name, status: 'error', error: se?.message || 'Could not create site' })
      continue
    }

    const { error: te } = await admin.from('transformers').insert({
      customer_id: cust.id,
      site_id: site.id,
      serial_number: row.serial_number,
      year_of_manufacture: row.year_of_manufacture || null,
      warranty_status: row.warranty_status || 'under_warranty',
    })
    if (te) {
      results.push({ name: row.name, status: 'error', error: te.message })
      continue
    }

    await admin.from('customer_contacts').insert({
      customer_id: cust.id,
      site_id: site.id,
      name: row.contact_person,
      phone: row.phone,
      email: row.email || null,
      whatsapp_number: row.whatsapp_number || null,
      address: row.address || null,
      is_primary: true,
    })

    results.push({ name: row.name, status: 'success' })
  }

  return results
}
