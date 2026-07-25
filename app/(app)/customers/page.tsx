import { createClient, getAuthedUser } from '@/lib/supabase/server'
import CustomersPageClient from './CustomersPageClient'
import type { Customer } from '@/lib/types'

export default async function CustomersPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, { data: custs }] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const customerRows: Customer[] = custs || []
  let customers: (Customer & { site_count: number; sn_count: number })[] = []

  if (customerRows.length > 0) {
    // Fetch all site and transformer counts in 2 bulk queries instead of N×2 queries
    const customerIds = customerRows.map(c => c.id)
    const [{ data: sites }, { data: sns }] = await Promise.all([
      supabase.from('customer_sites').select('customer_id').in('customer_id', customerIds),
      supabase.from('transformers').select('customer_id').in('customer_id', customerIds),
    ])

    const siteMap: Record<string, number> = {}
    sites?.forEach(s => { siteMap[s.customer_id] = (siteMap[s.customer_id] || 0) + 1 })
    const snMap: Record<string, number> = {}
    sns?.forEach(s => { snMap[s.customer_id] = (snMap[s.customer_id] || 0) + 1 })

    customers = customerRows.map(c => ({ ...c, site_count: siteMap[c.id] || 0, sn_count: snMap[c.id] || 0 }))
  }

  return <CustomersPageClient customers={customers} userName={userName} userRole={userRole} />
}
