'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getFieldEngineersOverview, type FieldEngineerOverview } from './get-engineers'

export interface DashboardNotification {
  id: string
  woNumber: string
  status: string
  scheduledDate: string | null
  engineerName: string
  customerName: string
  alertReason?: 'missed' | 'at_risk_today'
  transformers: { serialNumber: string; warrantyStatus: string }[]
}

export interface DashboardExpiredWarranty {
  id: string
  customerName: string
  serialNumber: string
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
  status: string
}

export interface DashboardOffSiteUpdate {
  id: string
  actorName: string
  action: string
  createdAt: string
}

export interface DashboardKpis {
  inProgressCount: number
  unassignedCount: number
  pendingProductRequestsCount: number
  // Open (non-completed) notifications by their linked transformer's warranty tier —
  // counted per notification (matches /work-orders?warranty=<tier>), so one covering
  // multiple transformers in the same tier still only counts once.
  warrantyBreakdown: { under_warranty: number; expired: number; amc: number }
  jobTypeBreakdown: { jobType: string; count: number }[]
}

export interface DashboardData {
  engineers: FieldEngineerOverview[]
  recentNotifications: DashboardNotification[]
  pendingApprovals: DashboardApproval[]
  overdueList: DashboardNotification[]
  needsReassignList: DashboardWorkOrderBrief[]
  unassignedList: DashboardWorkOrderBrief[]
  offSiteUpdates: DashboardOffSiteUpdate[]
  expiredWarrantyList: DashboardExpiredWarranty[]
  kpis: DashboardKpis
}

type NotifRow = {
  id: string; wo_number: string; status: string; scheduled_date: string | null; engineer_id: string | null
  customers: { name: string } | null
  work_order_transformers: { transformers: { serial_number: string; warranty_status: string } | null }[]
}
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
    { data: openWorkOrderRows },
    { data: expiredTransformerRows },
    { count: pendingProductRequestsCount },
  ] = await Promise.all([
    getFieldEngineersOverview(),
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name), work_order_transformers(transformers(serial_number, warranty_status))').neq('status', 'completed').order('updated_at', { ascending: false }).limit(6),
    // Anything the admin still needs to keep an eye on, not just what needs a decision
    // right now — stays on the dashboard through approved/dispatched, only dropping off
    // once it's delivered or rejected. Same "till delivered" scope as the mobile
    // dashboard's equivalent card.
    admin.from('product_request_items').select('id, quantity, status, products(name), product_requests(work_orders(wo_number))').in('status', ['pending', 'approved', 'dispatched']).order('created_at', { ascending: false }).limit(6),
    // Genuinely missed: still in_progress (was checked into / had a follow-up) but the
    // follow-up date has already passed with no closure since.
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').eq('status', 'in_progress').lt('scheduled_date', todayStr).order('scheduled_date', { ascending: true }).limit(6),
    // At risk: scheduled for today (either a first visit still 'assigned', or a
    // follow-up on an already-'in_progress' job) with nothing done on it yet today —
    // an early warning before it becomes a "missed" one above.
    admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, customers(name)').in('status', ['assigned', 'in_progress']).eq('scheduled_date', todayStr).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'needs_reassignment').order('updated_at', { ascending: false }).limit(6),
    admin.from('work_orders').select('id, wo_number, customers(name)').eq('status', 'unassigned').order('created_at', { ascending: false }).limit(6),
    admin.from('activity_log').select('id, actor_name, action, created_at').eq('entity_type', 'off_site_status_update').order('created_at', { ascending: false }).limit(6),
    // Powers the KPI cards: in-progress/unassigned counts, job-type breakdown, and
    // warranty-tier breakdown all derived from one pass over every open notification.
    admin.from('work_orders').select('id, status, job_type, work_order_transformers(transformers(warranty_status))').neq('status', 'completed'),
    // Straight off transformers.warranty_status (not scoped to open notifications like
    // the KPI breakdown above) — every expired unit on record, regardless of whether it
    // currently has an open job against it.
    admin.from('transformers').select('id, serial_number, customers(name)').eq('warranty_status', 'expired').order('created_at', { ascending: false }).limit(8),
    admin.from('product_request_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
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
    transformers: (w.work_order_transformers || [])
      .map(wot => wot.transformers)
      .filter((t): t is { serial_number: string; warranty_status: string } => !!t)
      .map(t => ({ serialNumber: t.serial_number, warrantyStatus: t.warranty_status })),
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

  type ApprovalRowRaw = { id: string; quantity: number; status: string; products: { name: string } | null; product_requests: { work_orders: { wo_number: string } | null } | null }
  const pendingApprovals: DashboardApproval[] = ((approvalRowsRaw as unknown as ApprovalRowRaw[]) || []).map(r => ({
    id: r.id,
    quantity: r.quantity,
    productName: r.products?.name || 'Unknown product',
    woNumber: r.product_requests?.work_orders?.wo_number || '—',
    status: r.status,
  }))

  type ExpiredTransformerRow = { id: string; serial_number: string; customers: { name: string } | null }
  const expiredWarrantyList: DashboardExpiredWarranty[] = ((expiredTransformerRows as unknown as ExpiredTransformerRow[]) || []).map(t => ({
    id: t.id,
    customerName: t.customers?.name || 'Unknown customer',
    serialNumber: t.serial_number,
  }))

  const offSiteUpdates: DashboardOffSiteUpdate[] = ((offSiteRows as unknown as { id: string; actor_name: string; action: string; created_at: string }[]) || []).map(r => ({
    id: r.id,
    actorName: r.actor_name,
    action: r.action,
    createdAt: r.created_at,
  }))

  type OpenWoRow = { id: string; status: string; job_type: string; work_order_transformers: { transformers: { warranty_status: string } | null }[] }
  const openWoRows = (openWorkOrderRows as unknown as OpenWoRow[]) || []
  const inProgressCount = openWoRows.filter(w => w.status === 'in_progress').length
  const unassignedCount = openWoRows.filter(w => w.status === 'unassigned').length

  const jobTypeCounts: Record<string, number> = {}
  openWoRows.forEach(w => { jobTypeCounts[w.job_type] = (jobTypeCounts[w.job_type] || 0) + 1 })
  const jobTypeBreakdown = Object.entries(jobTypeCounts)
    .map(([jobType, count]) => ({ jobType, count }))
    .sort((a, b) => b.count - a.count)

  // Counted per notification (not per transformer link) so this matches what clicking
  // through to /work-orders?warranty=<tier> actually shows — a notification with two
  // transformers in the same tier still only counts once.
  const warrantyBreakdown = { under_warranty: 0, expired: 0, amc: 0 }
  openWoRows.forEach(w => {
    const tiers = new Set(w.work_order_transformers.map(wot => wot.transformers?.warranty_status).filter(Boolean))
    tiers.forEach(tier => {
      if (tier === 'under_warranty' || tier === 'expired' || tier === 'amc') warrantyBreakdown[tier]++
    })
  })

  const kpis: DashboardKpis = {
    inProgressCount,
    unassignedCount,
    pendingProductRequestsCount: pendingProductRequestsCount || 0,
    warrantyBreakdown,
    jobTypeBreakdown,
  }

  return { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList, offSiteUpdates, expiredWarrantyList, kpis }
}
