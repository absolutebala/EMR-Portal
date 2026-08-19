'use server'

import { adminClient } from '@/lib/mobile/core/shared'

export interface BulkProductRow {
  name: string
  productId: string
  hierarchy: string
  level1: string
}

export interface BulkProductResult {
  name: string
  status: 'success' | 'error'
  error?: string
}

// Same shape as bulkImportCustomers — loop rows with their own duplicate checks (name
// has no DB-level uniqueness, so that check is app-layer only; Product ID maps to the
// existing sap_code column, which also isn't DB-unique but is still worth flagging as
// a likely mistake). New products start at 0 stock — the sheet has no quantity column,
// stock is adjusted separately via the catalog page.
export async function bulkImportProducts(rows: BulkProductRow[]): Promise<BulkProductResult[]> {
  const admin = adminClient()
  const results: BulkProductResult[] = []

  for (const row of rows) {
    const { data: existingByName } = await admin.from('products').select('id').ilike('name', row.name).maybeSingle()
    if (existingByName) {
      results.push({ name: row.name, status: 'error', error: `Product "${row.name}" already exists.` })
      continue
    }

    if (row.productId) {
      const { data: existingById } = await admin.from('products').select('id').eq('sap_code', row.productId).maybeSingle()
      if (existingById) {
        results.push({ name: row.name, status: 'error', error: `Product ID "${row.productId}" is already in use.` })
        continue
      }
    }

    const { error } = await admin.from('products').insert({
      name: row.name,
      sap_code: row.productId || null,
      hierarchy: row.hierarchy || null,
      level_1: row.level1 || null,
      stock_qty: 0,
    })
    if (error) {
      results.push({ name: row.name, status: 'error', error: error.message })
      continue
    }

    results.push({ name: row.name, status: 'success' })
  }

  return results
}
