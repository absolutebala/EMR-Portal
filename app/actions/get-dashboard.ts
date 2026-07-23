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

export interface DashboardWorkOrderBrief {
  id: string
  woNumber: string
  customerName: string
}

export interface DashboardApproval {
  id: string
  quantity: number
  productName: string
  woNumber: string
}

export interface DashboardData {
  engineers: FieldEngineerOverview[]
  recentNotifications: DashboardNotification[]
  pendingApprovals: DashboardApproval[]
  overdueList: DashboardNotification[]
  needsReassignList: DashboardWorkOrderBrief[]
  unassignedList: DashboardWorkOrderBrief[]
}

type NotifRow = { id: string; wo_number: string; status: string; scheduled_date: string | null; engineer_id: string | null; customers: { name: string } | null }
type BriefRow = { id: string; wo_number: string; customers: { name: string } | null }

// Uses the admin (service-role) client throughout, not the session-scoped client —
// this page shows org-wide data (every engineer, every notification) regardless of
// the viewing admin's own RLS grants. profiles in particular is RLS-locked to "view
// your own row" for most roles, which silently made every notification's engineer
// name resolve to a fallback string when this was fetched with the session client.
export async function getDashboardData(): Promise<DashboardData> {
  const admin = adminClient()
  const todayStr = new Date().toLocaleDateString('en-CA')

  const [
    { engineers },
    { data: recentNotifRows },
    { data: approvalRowsRaw },
    { data: overdueRows },
    { data: needsReassignRows },
    { data: unassignedRows },
  ] = await Promise.all([
    getFieldEngineersOverview(),
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').neq('status', 'completed').order('updated_at', { ascending: false }).limit(6),
    admin.from('product_request_items').select('id, quantity, products(name), product_requests(work_orders(wo_number))').eq('status', 'pending').order('created_at', { ascending: false }).limit(6),
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').eq('status', 'in_progress').lt('scheduled_date', todayStr).order('scheduled_date', { ascending: true }).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'needs_reassignment').order('updated_at', { ascending: false }).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'unassigned').order('created_at', { ascending: false }).limit(6),
  ])

  // work_orders has two FK paths to profiles (engineer_id, created_by), so embedding
  // profiles(...) directly risks an "ambiguous relationship" failure — a similarly
  // ambiguous nested embed broke in production before. Fetched separately instead.
  const notifRows = (recentNotifRows as unknown as NotifRow[]) || []
  const overdueRowsTyped = (overdueRows as unknown as NotifRow[]) || []
  const engineerIds = [...new Set([...notifRows, ...overdueRowsTyped].map(w => w.engineer_id).filter(Boolean))] as string[]
  const { data: engineerRows } = engineerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', engineerIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] }
  const engineerNameById: Record<string, string> = {}
  ;(engineerRows || []).forEach(p => { engineerNameById[p.id] = `${p.first_name} ${p.last_name}` })

  const toNotification = (w: NotifRow): DashboardNotification => ({
    id: w.id,
    woNumber: w.wo_number,
    status: w.status,
    scheduledDate: w.scheduled_date,
    engineerName: w.engineer_id ? (engineerNameById[w.engineer_id] || 'Engineer') : 'Unassigned',
    customerName: w.customers?.name || 'Unknown customer',
  })
  const toBrief = (w: BriefRow): DashboardWorkOrderBrief => ({
    id: w.id,
    woNumber: w.wo_number,
    customerName: w.customers?.name || 'Unknown customer',
  })

  const recentNotifications = notifRows.map(toNotification)
  const overdueList = overdueRowsTyped.map(toNotification)
  const needsReassignList = ((needsReassignRows as unknown as BriefRow[]) || []).map(toBrief)
  const unassignedList = ((unassignedRows as unknown as BriefRow[]) || []).map(toBrief)

  type ApprovalRowRaw = { id: string; quantity: number; products: { name: string } | null; product_requests: { work_orders: { wo_number: string } | null } | null }
  const pendingApprovals: DashboardApproval[] = ((approvalRowsRaw as unknown as ApprovalRowRaw[]) || []).map(r => ({
    id: r.id,
    quantity: r.quantity,
    productName: r.products?.name || 'Unknown product',
    woNumber: r.product_requests?.work_orders?.wo_number || '—',
  }))

  return { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList }
}
