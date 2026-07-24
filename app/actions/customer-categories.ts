'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface CustomerCategory {
  id: string
  name: string
}

export type CustomerCategoryType = 'utility' | 'industry'

// Lists are small (a handful of named categories per type) — fetched in full and
// filtered client-side in the picker rather than a server-side search endpoint.
export async function getCustomerCategories(customerType: CustomerCategoryType): Promise<{ categories: CustomerCategory[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin
      .from('customer_categories')
      .select('id, name')
      .eq('customer_type', customerType)
      .order('name')
    if (error) return { categories: [], error: error.message }
    return { categories: data || [], error: null }
  } catch (e: unknown) {
    return { categories: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Create-if-not-exists (case-insensitive) — lets the notification form add a new
// category inline without a separate admin screen, same as typing a new tag.
export async function getOrCreateCustomerCategory(customerType: CustomerCategoryType, name: string): Promise<{ category: CustomerCategory | null; error: string | null }> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { category: null, error: 'Name is required' }

    const admin = adminClient()
    const { data: existing } = await admin
      .from('customer_categories')
      .select('id, name')
      .eq('customer_type', customerType)
      .ilike('name', trimmed)
      .maybeSingle()
    if (existing) return { category: existing, error: null }

    const { data: created, error } = await admin
      .from('customer_categories')
      .insert({ customer_type: customerType, name: trimmed })
      .select('id, name')
      .single()
    if (error) return { category: null, error: error.message }
    return { category: created, error: null }
  } catch (e: unknown) {
    return { category: null, error: e instanceof Error ? e.message : String(e) }
  }
}
