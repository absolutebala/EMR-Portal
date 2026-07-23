'use server'

import { createClient } from '@supabase/supabase-js'
import { getFieldEngineersOverview, type FieldEngineerOverview } from './get-engineers'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface DashboardNotification {
  id: string
  woNumber: string
  status: string
  scheduledDate: string | null
  engineerName: string
  customerName: string
}

export interface DashboardApproval {
  id: string
  quantity: number
  productName: string
  woNumber: string
}

export interface DashboardData {
  stats: { userCount: number; customerCount: number; formCount: number; openNotifCount: number }
  engineers: FieldEngineerOverview[]
  attention: { overdueCount: number; needsReassignCount: number; unassignedCount: number; pendingApprovalCount: number }
  recentNotifications: DashboardNotification[]
  pendingApprovals: DashboardApproval[]
}

// Uses the admin (service-role) client throughout, not the session-scoped client —
// this page shows org-wide data (every engineer, every notification) regardless of
// the viewing admin's own RLS grants. profiles in particular is RLS-locked to "view
// your own row" for most roles, which silently made every notification's engineer
// name resolve to a fallback string when this was fetched with the session client.
export async function getDashboardData(): Promise<DashboardData> {
  const admin = adminClient()
  const todayStr = new Date().toLocaleDateString('en-CA')

  const [
    { count: userCount },
    { count: customerCount },
    { count: formCount },
    { count: openNotifCount },
    { engineers },
    { count: overdueCount },
    { count: needsReassignCount },
    { count: unassignedCount },
    { count: pendingApprovalCount },
    { data: recentNotifRows },
    { data: approvalRowsRaw },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('customers').select('*', { count: 'exact', head: true }),
    admin.from('forms').select('*', { count: 'exact', head: true }),
    admin.from('work_orders').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
    getFieldEngineersOverview(),
    admin.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'in_progress').lt('scheduled_date', todayStr),
    admin.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'needs_reassignment'),
    admin.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'unassigned'),
    admin.from('product_request_items').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').neq('status', 'completed').order('updated_at', { ascending: false }).limit(6),
    admin.from('product_request_items').select('id, quantity, products(name), product_requests(work_orders(wo_number))').eq('status', 'pending').order('created_at', { ascending: false }).limit(6),
  ])

  // work_orders has two FK paths to profiles (engineer_id, created_by), so embedding
  // profiles(...) directly risks an "ambiguous relationship" failure — a similarly
  // ambiguous nested embed broke in production before. Fetched separately instead.
  type NotifRow = { id: string; wo_number: string; status: string; scheduled_date: string | null; engineer_id: string | null; customers: { name: string } | null }
  const notifRows = (recentNotifRows as unknown as NotifRow[]) || []
  const engineerIds = [...new Set(notifRows.map(w => w.engineer_id).filter(Boolean))] as string[]
  const { data: notifEngineerRows } = engineerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }
  const engineerNameById: Record<string, string> = {}
  ;(notifEngineerRows || []).forEach(p => { engineerNameById[p.id] = `${p.first_name} ${p.last_name}` })

  const recentNotifications: DashboardNotification[] = notifRows.map(w => ({
    id: w.id,
    woNumber: w.wo_number,
    status: w.status,
    scheduledDate: w.scheduled_date,
    engineerName: w.engineer_id ? (engineerNameById[w.engineer_id] || 'Engineer') : 'Unassigned',
    customerName: w.customers?.name || 'Unknown customer',
  }))

  type ApprovalRowRaw = { id: string; quantity: number; products: { name: string } | null; product_requests: { work_orders: { wo_number: string } | null } | null }
  const pendingApprovals: DashboardApproval[] = ((approvalRowsRaw as unknown as ApprovalRowRaw[]) || []).map(r => ({
    id: r.id,
    quantity: r.quantity,
    productName: r.products?.name || 'Unknown product',
    woNumber: r.product_requests?.work_orders?.wo_number || '—',
  }))

  return {
    stats: { userCount: userCount ?? 0, customerCount: customerCount ?? 0, formCount: formCount ?? 0, openNotifCount: openNotifCount ?? 0 },
    engineers,
    attention: {
      overdueCount: overdueCount ?? 0,
      needsReassignCount: needsReassignCount ?? 0,
      unassignedCount: unassignedCount ?? 0,
      pendingApprovalCount: pendingApprovalCount ?? 0,
    },
    recentNotifications,
    pendingApprovals,
  }
}
