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
  alertReason?: 'missed' | 'at_risk_today'
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

export interface DashboardOffSiteUpdate {
  id: string
  actorName: string
  action: string
  createdAt: string
}

export interface DashboardData {
  engineers: FieldEngineerOverview[]
  recentNotifications: DashboardNotification[]
  pendingApprovals: DashboardApproval[]
  overdueList: DashboardNotification[]
  needsReassignList: DashboardWorkOrderBrief[]
  unassignedList: DashboardWorkOrderBrief[]
  offSiteUpdates: DashboardOffSiteUpdate[]
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
    { data: missedRows },
    { data: atRiskRows },
    { data: needsReassignRows },
    { data: unassignedRows },
    { data: offSiteRows },
  ] = await Promise.all([
    getFieldEngineersOverview(),
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').neq('status', 'completed').order('updated_at', { ascending: false }).limit(6),
    admin.from('product_request_items').select('id, quantity, products(name), product_requests(work_orders(wo_number))').eq('status', 'pending').order('created_at', { ascending: false }).limit(6),
    // Genuinely missed: still in_progress (was checked into / had a follow-up) but the
    // follow-up date has already passed with no closure since.
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').eq('status', 'in_progress').lt('scheduled_date', todayStr).order('scheduled_date', { ascending: true }).limit(6),
    // At risk: scheduled for today, still un-started — an early warning before it
    // becomes a "missed" one above.
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').eq('status', 'assigned').eq('scheduled_date', todayStr).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'needs_reassignment').order('updated_at', { ascending: false }).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'unassigned').order('created_at', { ascending: false }).limit(6),
    admin.from('activity_log').select('id, actor_name, action, created_at').eq('entity_type', 'off_site_status_update').order('created_at', { ascending: false }).limit(6),
  ])

  // work_orders has two FK paths to profiles (engineer_id, created_by), so embedding
  // profiles(...) directly risks an "ambiguous relationship" failure — a similarly
  // ambiguous nested embed broke in production before. Fetched separately instead.
  const notifRows = (recentNotifRows as unknown as NotifRow[]) || []
  const missedRowsTyped = (missedRows as unknown as NotifRow[]) || []
  const atRiskRowsRaw = (atRiskRows as unknown as NotifRow[]) || []
  const engineerIds = [...new Set([...notifRows, ...missedRowsTyped, ...atRiskRowsRaw].map(w => w.engineer_id).filter(Boolean))] as string[]
  const { data: engineerRows } = engineerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, engineer_status, engineer_status_work_order_id').in('id', engineerIds)
    : { data: [] as { id: string; first_name: string; last_name: string; engineer_status: string | null; engineer_status_work_order_id: string | null }[] }
  const engineerNameById: Record<string, string> = {}
  ;(engineerRows || []).forEach(p => { engineerNameById[p.id] = `${p.first_name} ${p.last_name}` })

  // "At risk today" should exclude a job the engineer has already begun acting on —
  // on_the_way/travelling/reached — even though only checking in (reached) actually
  // flips work_orders.status to in_progress; on_the_way/travelling are a separate
  // live-status signal that doesn't touch work_orders.status at all.
  const STARTED_STATUSES = new Set(['on_the_way', 'travelling', 'reached'])
  const atRiskRowsTyped = atRiskRowsRaw.filter(w => {
    if (!w.engineer_id) return true
    const eng = (engineerRows || []).find(p => p.id === w.engineer_id)
    if (!eng) return true
    const started = eng.engineer_status_work_order_id === w.id && STARTED_STATUSES.has(eng.engineer_status || '')
    return !started
  })

  const toNotification = (w: NotifRow, alertReason?: 'missed' | 'at_risk_today'): DashboardNotification => ({
    id: w.id,
    woNumber: w.wo_number,
    status: w.status,
    scheduledDate: w.scheduled_date,
    engineerName: w.engineer_id ? (engineerNameById[w.engineer_id] || 'Engineer') : 'Unassigned',
    customerName: w.customers?.name || 'Unknown customer',
    alertReason,
  })
  const toBrief = (w: BriefRow): DashboardWorkOrderBrief => ({
    id: w.id,
    woNumber: w.wo_number,
    customerName: w.customers?.name || 'Unknown customer',
  })

  const recentNotifications = notifRows.map(w => toNotification(w))
  const overdueList = [
    ...missedRowsTyped.map(w => toNotification(w, 'missed')),
    ...atRiskRowsTyped.map(w => toNotification(w, 'at_risk_today')),
  ].slice(0, 6)
  const needsReassignList = ((needsReassignRows as unknown as BriefRow[]) || []).map(toBrief)
  const unassignedList = ((unassignedRows as unknown as BriefRow[]) || []).map(toBrief)

  type ApprovalRowRaw = { id: string; quantity: number; products: { name: string } | null; product_requests: { work_orders: { wo_number: string } | null } | null }
  const pendingApprovals: DashboardApproval[] = ((approvalRowsRaw as unknown as ApprovalRowRaw[]) || []).map(r => ({
    id: r.id,
    quantity: r.quantity,
    productName: r.products?.name || 'Unknown product',
    woNumber: r.product_requests?.work_orders?.wo_number || '—',
  }))

  const offSiteUpdates: DashboardOffSiteUpdate[] = ((offSiteRows as unknown as { id: string; actor_name: string; action: string; created_at: string }[]) || []).map(r => ({
    id: r.id,
    actorName: r.actor_name,
    action: r.action,
    createdAt: r.created_at,
  }))

  return { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList, offSiteUpdates }
}
