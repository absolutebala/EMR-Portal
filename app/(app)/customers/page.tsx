import { getAuthedUser } from '@/lib/cognito/server'
import { getMyPermissions } from '@/app/actions/roles-actions'
import CustomersPageClient from './CustomersPageClient'
import type { Customer } from '@/lib/types'
import { adminClient } from '@/lib/db/admin-client'

export default async function CustomersPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, { data: custs }, { data: endTypes }, { permissions }] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    adminClient().from('customers').select('*').order('created_at', { ascending: false }),
    adminClient().from('customer_categories').select('id, name').eq('customer_type', 'end_customer_type'),
    getMyPermissions(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const customerRows: Customer[] = custs || []
  let customers: (Customer & { site_count: number; sn_count: number })[] = []

  // end_customer_type_name isn't a stored column — resolved here (same "id -> name map"
  // approach as site_count/sn_count below) rather than a per-row join, since the
  // category catalog is small enough to fetch once and reuse across every customer.
  const endTypeMap: Record<string, string> = {}
  endTypes?.forEach(c => { endTypeMap[c.id] = c.name })

  if (customerRows.length > 0) {
    // Fetch all site and transformer counts in 2 bulk queries instead of N×2 queries
    const customerIds = customerRows.map(c => c.id)
    const [{ data: sites }, { data: sns }] = await Promise.all([
      adminClient().from('customer_sites').select('customer_id').in('customer_id', customerIds),
      adminClient().from('transformers').select('customer_id').in('customer_id', customerIds),
    ])

    const siteMap: Record<string, number> = {}
    sites?.forEach(s => { siteMap[s.customer_id] = (siteMap[s.customer_id] || 0) + 1 })
    const snMap: Record<string, number> = {}
    sns?.forEach(s => { snMap[s.customer_id] = (snMap[s.customer_id] || 0) + 1 })

    customers = customerRows.map(c => ({
      ...c,
      site_count: siteMap[c.id] || 0,
      sn_count: snMap[c.id] || 0,
      end_customer_type_name: c.end_customer_type_id ? (endTypeMap[c.end_customer_type_id] || null) : null,
    }))
  }

  return <CustomersPageClient customers={customers} userName={userName} userRole={userRole} permissions={permissions} />
}
