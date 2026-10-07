'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getMyDepartmentScope } from './departments'
import type { ComplaintReportRow } from '@/lib/reports'

// PostgREST returns the to-one embeds (customers, transformers, customer_sites) as
// objects, but the generated types can widen them to arrays — the fields are typed
// loosely and normalised at read time below.
type SiteEmbed = { site_name?: string } | { site_name?: string }[] | null | undefined
type TransEmbed = { customer_sites?: SiteEmbed } | { customer_sites?: SiteEmbed }[] | null | undefined
type WoRow = {
  id: string; wo_number: string; ticket_number: string; status: string
  customer_message: string | null; reported_date: string | null; created_at: string
  engineer_id: string | null; direct_customer_name: string | null
  customers: { name: string } | { name: string }[] | null
  work_order_transformers: { transformers: TransEmbed }[] | null
}

function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined)
}
function firstSiteName(wots: WoRow['work_order_transformers']): string {
  for (const wot of wots || []) {
    const trans = one(wot.transformers)
    const site = one(trans?.customer_sites)
    if (site?.site_name) return site.site_name
  }
  return ''
}

// Every complaint (work order) visible to the current user, newest first. Service
// Managers are scoped to their department(s) (plus untagged), matching the Notifications
// list; Super Admin / Head of Service see all. Used by both the Reports page and the
// weekly-download route, so the two never drift.
export async function getComplaintReports(): Promise<{ rows: ComplaintReportRow[]; error: string | null }> {
  try {
    const admin = adminClient()
    const departmentScope = await getMyDepartmentScope()
    // any: the postgrest-js builder's generic type is too deep for TS through a wrapper
    // (TS2589) — the real query stays type-checked, this just conditionally scopes it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopeWo = (q: any): any => (departmentScope ? q.or(`department_id.in.(${departmentScope.join(',')}),department_id.is.null`) : q)

    // customers + site are embedded (to-one FKs) so there's no large .in() URL to blow
    // the proxy limit on. The engineer has two FK paths to profiles, so it's resolved
    // separately by id (bounded by the engineer count, not the complaint count).
    const { data, error } = await scopeWo(
      admin.from('work_orders')
        .select('id, wo_number, ticket_number, status, customer_message, reported_date, created_at, department_id, engineer_id, direct_customer_name, customers(name), work_order_transformers(transformers(customer_sites(site_name)))')
        .order('created_at', { ascending: false })
    )
    if (error) return { rows: [], error: error.message }
    const woRows = (data as unknown as WoRow[]) || []

    const engineerIds = [...new Set(woRows.map(r => r.engineer_id).filter(Boolean))] as string[]
    const { data: engineerRows } = engineerIds.length
      ? await admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds)
      : { data: [] as { id: string; first_name: string; last_name: string }[] }
    const engineerNameById: Record<string, string> = {}
    ;(engineerRows || []).forEach(p => { engineerNameById[p.id] = `${p.first_name} ${p.last_name}`.trim() })

    const rows: ComplaintReportRow[] = woRows.map(r => {
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
      return {
        id: r.id,
        woNumber: r.wo_number,
        ticketNumber: r.ticket_number,
        customerName: cust?.name || r.direct_customer_name || 'Unknown customer',
        siteName: firstSiteName(r.work_order_transformers),
        engineerName: r.engineer_id ? (engineerNameById[r.engineer_id] || 'Engineer') : 'Unassigned',
        customerIssue: r.customer_message || '',
        status: r.status,
        complaintDate: r.reported_date || r.created_at,
      }
    })
    return { rows, error: null }
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  }
}
