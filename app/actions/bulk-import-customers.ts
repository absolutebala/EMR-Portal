'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getOrCreateCustomerCategory } from './customer-categories'

export interface BulkCustomerRow {
  name: string
  contact_person: string
  phone: string
  email: string
  whatsapp_number: string
  address: string
  pincode: string
  end_customer_type_name: string
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
  // Cached across the whole batch — real-world sheets repeat the same end-customer
  // type ("OEM", "Solar"...) across many rows, and get-or-create-by-name shouldn't hit
  // the DB again for a value this same import already resolved.
  const endTypeCache = new Map<string, string>()

  async function resolveEndCustomerTypeId(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    const cached = endTypeCache.get(trimmed.toLowerCase())
    if (cached) return cached
    const { category } = await getOrCreateCustomerCategory('end_customer_type', trimmed)
    if (category) endTypeCache.set(trimmed.toLowerCase(), category.id)
    return category?.id ?? null
  }

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

    const endCustomerTypeId = await resolveEndCustomerTypeId(row.end_customer_type_name)

    const { data: cust, error: ce } = await admin.from('customers').insert({
      name: row.name,
      // Bulk-imported sheets don't distinguish Sold/Shipped/Both in practice — every
      // real-world file seen so far uses this column position for end-customer type
      // instead (OEM, Solar, etc.), handled separately below.
      type: 'both',
      contact_person: row.contact_person,
      phone: row.phone,
      email: row.email || null,
      whatsapp_number: row.whatsapp_number || null,
      address: row.address || null,
      pincode: row.pincode || null,
      end_customer_type_id: endCustomerTypeId,
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
