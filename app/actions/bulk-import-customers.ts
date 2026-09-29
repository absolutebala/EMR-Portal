'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getOrCreateCustomerCategory } from './customer-categories'

export interface BulkCustomerRow {
  name: string
  sap_customer_code?: string
  contact_person: string
  phone: string
  email: string
  whatsapp_number: string
  address: string
  pincode: string
  city?: string
  region?: string
  search_term?: string
  end_customer_type_name: string
  customer_notes?: string
  site_name: string
  site_address: string
  // Transformer (all optional — a customer-only row leaves these blank)
  serial_number: string
  year_of_manufacture: string
  warranty_status: string
  rating?: string
  manufacturer?: string
  dispatch_date?: string
  transformer_notes?: string
}

export interface BulkImportOptions {
  // When true, a customer that already exists (matched by SAP code, else by name) is
  // reused and the row's transformer is attached to it, instead of the row being
  // rejected as a duplicate. This is what lets the NIPS register — where one input
  // line expands into many serials, and many lines can share a customer — build one
  // customer with all its transformers. The OLTC customer master leaves this off so a
  // repeated customer is flagged rather than silently merged.
  attachToExisting?: boolean
}

export interface BulkCustomerResult {
  name: string
  // 'skipped' = already in the system (customer/serial already imported) — a benign
  // no-op on a re-upload, kept distinct from a real 'error' so a big skipped count on
  // a repeat import doesn't read as failures.
  status: 'success' | 'error' | 'skipped'
  error?: string
}

async function createCustomerWithSite(
  admin: ReturnType<typeof adminClient>,
  row: BulkCustomerRow,
  endCustomerTypeId: string | null,
): Promise<{ customerId: string; siteId: string } | { error: string }> {
  const { data: cust, error: ce } = await admin.from('customers').insert({
    name: row.name,
    // Bulk sheets don't distinguish Sold/Shipped/Both — end-customer type lives in its
    // own column instead, resolved separately above.
    type: 'both',
    contact_person: row.contact_person || row.name || '',
    phone: row.phone || '',
    email: row.email || null,
    whatsapp_number: row.whatsapp_number || null,
    address: row.address || null,
    pincode: row.pincode || null,
    city: row.city || null,
    region: row.region || null,
    search_term: row.search_term || null,
    sap_customer_code: row.sap_customer_code || null,
    end_customer_type_id: endCustomerTypeId,
    notes: row.customer_notes || null,
  }).select().single()
  if (ce || !cust) return { error: ce?.message || 'Could not create customer' }

  const { data: site, error: se } = await admin.from('customer_sites').insert({
    customer_id: cust.id,
    site_name: row.site_name || row.name,
    site_address: row.site_address || row.address || '',
  }).select().single()
  if (se || !site) return { error: se?.message || 'Could not create site' }

  // Only seed a primary contact when there's an actual person/number to record.
  if (row.contact_person || row.phone) {
    await admin.from('customer_contacts').insert({
      customer_id: cust.id,
      site_id: site.id,
      name: row.contact_person || row.name,
      phone: row.phone || null,
      email: row.email || null,
      whatsapp_number: row.whatsapp_number || null,
      address: row.address || null,
      is_primary: true,
    })
  }

  return { customerId: cust.id, siteId: site.id }
}

// Same customer -> site -> transformer -> primary-contact shape as addCustomer() in
// save-customer.ts, looped per row. customers.name has no DB-level uniqueness so that
// check is app-layer; transformers.serial_number is a real UNIQUE constraint so it's
// checked up front for a clean per-row message. With attachToExisting, an already-known
// customer is reused (and cached for the rest of the batch) so a serial range that was
// expanded into many rows all hang off one customer.
export async function bulkImportCustomers(rows: BulkCustomerRow[], opts: BulkImportOptions = {}): Promise<BulkCustomerResult[]> {
  const admin = adminClient()
  const results: BulkCustomerResult[] = []
  const endTypeCache = new Map<string, string>()
  // key (sap code || lowercased name) -> { customerId, siteId }, for customers created
  // OR reused earlier in this same batch.
  const customerCache = new Map<string, { customerId: string; siteId: string }>()

  async function resolveEndCustomerTypeId(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    const cached = endTypeCache.get(trimmed.toLowerCase())
    if (cached) return cached
    const { category } = await getOrCreateCustomerCategory('end_customer_type', trimmed)
    if (category) endTypeCache.set(trimmed.toLowerCase(), category.id)
    return category?.id ?? null
  }

  function customerKey(row: BulkCustomerRow): string {
    return (row.sap_customer_code?.trim() || row.name.trim().toLowerCase())
  }

  // Which serials in this call already exist? One batched query instead of one per row
  // — the difference between a few round-trips and tens of thousands on a large dispatch
  // register (a 55k-row NIPS file would otherwise make 55k serial-lookup queries alone).
  const serialList = [...new Set(rows.map(r => r.serial_number).filter(Boolean))] as string[]
  const existingSerials = new Set<string>()
  if (serialList.length) {
    const { data } = await admin.from('transformers').select('serial_number').in('serial_number', serialList)
    ;(data || []).forEach(t => { if (t.serial_number) existingSerials.add(t.serial_number) })
  }

  // Transformers are collected and bulk-inserted at the end (one insert for the call,
  // not one per unit).
  const pendingTx: { label: string; insert: Record<string, unknown> }[] = []
  const seenSerials = new Set<string>()

  for (const row of rows) {
    const label = row.serial_number ? `${row.name || 'Customer'} — ${row.serial_number}` : row.name

    // Skip serials already in the DB, or repeated earlier in this same call.
    if (row.serial_number && (existingSerials.has(row.serial_number) || seenSerials.has(row.serial_number))) {
      results.push({ name: label, status: 'skipped', error: `Serial "${row.serial_number}" already imported.` })
      continue
    }

    // ---- Resolve (or create) the customer ----
    const key = customerKey(row)
    let resolved = customerCache.get(key)

    if (!resolved) {
      // Look for an existing customer. When a SAP code is present it is THE unique key,
      // so match on it alone — do NOT also fall back to name, or two distinct accounts
      // that share a company name (very common in the SAP master, e.g. two "EMR Tap
      // Changers" accounts with different codes) would collapse and the later rows get
      // dropped as false "duplicates". Only match by name when there's no SAP code.
      let existing: { id: string } | null = null
      if (row.sap_customer_code?.trim()) {
        const { data } = await admin.from('customers').select('id').eq('sap_customer_code', row.sap_customer_code.trim()).maybeSingle()
        existing = data
      } else if (row.name) {
        const { data } = await admin.from('customers').select('id').ilike('name', row.name).maybeSingle()
        existing = data
      }

      if (existing) {
        if (!opts.attachToExisting) {
          results.push({ name: row.name, status: 'skipped', error: 'Already imported.' })
          continue
        }
        // Reuse the existing customer; grab (or make) a site to hang transformers on.
        const { data: site } = await admin.from('customer_sites').select('id').eq('customer_id', existing.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
        let siteId = site?.id as string | undefined
        if (!siteId) {
          const { data: newSite } = await admin.from('customer_sites').insert({
            customer_id: existing.id,
            site_name: row.site_name || row.name,
            site_address: row.site_address || row.address || '',
          }).select().single()
          siteId = newSite?.id
        }
        resolved = { customerId: existing.id, siteId: siteId || '' }
      } else {
        const endCustomerTypeId = await resolveEndCustomerTypeId(row.end_customer_type_name)
        const created = await createCustomerWithSite(admin, row, endCustomerTypeId)
        if ('error' in created) {
          results.push({ name: row.name, status: 'error', error: created.error })
          continue
        }
        resolved = created
      }
      customerCache.set(key, resolved)
    }

    // Customer-only row (OLTC master) — done.
    if (!row.serial_number) {
      results.push({ name: row.name, status: 'success' })
      continue
    }

    // Otherwise queue the transformer for the bulk insert below.
    seenSerials.add(row.serial_number)
    pendingTx.push({
      label,
      insert: {
        customer_id: resolved.customerId,
        site_id: resolved.siteId || null,
        serial_number: row.serial_number,
        rating: row.rating || null,
        manufacturer: row.manufacturer || null,
        year_of_manufacture: row.year_of_manufacture || null,
        warranty_status: row.warranty_status || 'under_warranty',
        dispatch_date: row.dispatch_date || null,
        notes: row.transformer_notes || null,
      },
    })
  }

  // ---- Bulk-insert the collected transformers, up to 500 at a time ----
  for (let i = 0; i < pendingTx.length; i += 500) {
    const batch = pendingTx.slice(i, i + 500)
    const { error } = await admin.from('transformers').insert(batch.map(b => b.insert))
    if (error) {
      // A bulk insert is all-or-nothing, so on failure retry the batch row-by-row to pin
      // down the offending serial(s) and let the rest through.
      for (const b of batch) {
        const { error: e2 } = await admin.from('transformers').insert(b.insert)
        results.push(e2 ? { name: b.label, status: 'error', error: e2.message } : { name: b.label, status: 'success' })
      }
    } else {
      for (const b of batch) results.push({ name: b.label, status: 'success' })
    }
  }

  return results
}
