'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getFieldEngineersOverview, type FieldEngineerOverview } from './get-engineers'
import { getMyDepartmentScope } from './departments'

// Sentinel used in place of a real department UUID for open notifications with no
// department tag — matches the work-orders list page's '?department=' query param
// (WorkOrdersPageClient.tsx's own copy of this same constant), since a real
// department is always a UUID. A 'use server' file may only export async functions,
// so this can't be a shared exported constant — duplicated instead.
const NO_DEPARTMENT_ID = 'no-department'

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
  ticketNumber: string
  customerName: string
  scheduledDate: string | null
}

export interface DashboardOverhaulingNotification {
  id: string
  woNumber: string
  customerName: string
  status: string
}

export interface DashboardDepartmentCount {
  departmentId: string
  department: string
  count: number
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
  // Open (non-completed) notifications by work_orders.status — "reached"/"checked in"
  // etc. are engineer-side live-status signals, not a separate work order status;
  // checking in already flips the work order itself to in_progress, so those are
  // already folded into the in_progress bucket here without any extra derivation.
  notificationBreakdown: { unassigned: number; assigned: number; in_progress: number; needs_reassignment: number }
  // product_request_items by status — 'rejected' is deliberately left out (a dead-end,
  // not a pipeline stage worth surfacing on the summary card).
  productRequestBreakdown: { pending: number; approved: number; dispatched: number; delivered: number }
  // Open (non-completed) notifications by their linked transformer's warranty tier —
  // counted per notification (matches /work-orders?warranty=<tier>), so one covering
  // multiple transformers in the same tier still only counts once.
  warrantyBreakdown: { under_warranty: number; expired: number; amc: number }
  jobTypeBreakdown: { jobType: string; count: number }[]
  // Open notifications per department, org-wide (every engineer) — only meaningful
  // for Super Admin/Head of Service, who see every department's load at a glance
  // rather than just their own (that's what the mobile dashboard's per-engineer
  // cards are for).
  departmentBreakdown: DashboardDepartmentCount[]
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
  overhaulingList: DashboardOverhaulingNotification[]
  kpis: DashboardKpis
}

type NotifRow = {
  id: string; wo_number: string; status: string; scheduled_date: string | null; engineer_id: string | null
  customers: { name: string } | null
  work_order_transformers: { transformers: { serial_number: string; warranty_status: string } | null }[]
}
type BriefRow = { id: string; wo_number: string; ticket_number: string; scheduled_date: string | null; customers: { name: string } | null }

// Uses the admin (service-role) client throughout, not the session-scoped client —
// this page shows org-wide data (every engineer, every notification) regardless of
// the viewing admin's own RLS grants. profiles in particular is RLS-locked to "view
// your own row" for most roles, which silently made every notification's engineer
// name resolve to a fallback string when this was fetched with the session client.
export async function getDashboardData(): Promise<DashboardData> {
  const admin = adminClient()
  const todayStr = new Date().toLocaleDateString('en-CA')
  // Service Manager sees only their own department's notifications (and anything
  // derived from them — product requests); every other role keeps the org-wide view.
  const departmentScope = await getMyDepartmentScope()
  // any: the postgrest-js builder's generic type is too deep for TS to instantiate
  // through a wrapper function (TS2589) — the `.in()` call itself stays fully
  // type-checked at each real call site, this just conditionally applies it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeWo = (q: any): any => (departmentScope ? q.in('department_id', departmentScope) : q)

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
    { data: productRequestStatusRows },
    { data: departmentRows },
    { data: overhaulingRows },
  ] = await Promise.all([
    getFieldEngineersOverview(),
    scopeWo(admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, department_id, customers(name), work_order_transformers(transformers(serial_number, warranty_status))').neq('status', 'completed').order('updated_at', { ascending: false }).limit(6)),
    // Anything the admin still needs to keep an eye on, not just what needs a decision
    // right now — stays on the dashboard through approved/dispatched, only dropping off
    // once it's delivered or rejected. Same "till delivered" scope as the mobile
    // dashboard's equivalent card. Department filtering happens below (post-fetch) since
    // it's on the doubly-nested work_orders relation.
    admin.from('product_request_items').select('id, quantity, status, products(name), product_requests(work_orders(wo_number, department_id))').in('status', ['pending', 'approved', 'dispatched']).order('created_at', { ascending: false }).limit(24),
    // Genuinely missed: still in_progress (was checked into / had a follow-up) but the
    // follow-up date has already passed with no closure since.
    scopeWo(admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, department_id, customers(name)').eq('status', 'in_progress').lt('scheduled_date', todayStr).order('scheduled_date', { ascending: true }).limit(6)),
    // At risk: scheduled for today (either a first visit still 'assigned', or a
    // follow-up on an already-'in_progress' job) with nothing done on it yet today —
    // an early warning before it becomes a "missed" one above.
    scopeWo(admin.from('work_orders').select('id, wo_number, status, scheduled_date, engineer_id, department_id, customers(name)').in('status', ['assigned', 'in_progress']).eq('scheduled_date', todayStr).limit(6)),
    scopeWo(admin.from('work_orders').select('id, wo_number, ticket_number, scheduled_date, department_id, customers(name)').eq('status', 'needs_reassignment').order('updated_at', { ascending: false }).limit(6)),
    scopeWo(admin.from('work_orders').select('id, wo_number, ticket_number, scheduled_date, department_id, customers(name)').eq('status', 'unassigned').order('created_at', { ascending: false }).limit(6)),
    admin.from('activity_log').select('id, actor_name, action, created_at').eq('entity_type', 'off_site_status_update').order('created_at', { ascending: false }).limit(6),
    // Powers the KPI cards: in-progress/unassigned counts, job-type breakdown,
    // warranty-tier breakdown, and per-department breakdown all derived from one pass
    // over every open notification.
    scopeWo(admin.from('work_orders').select('id, status, job_type, department_id, work_order_transformers(transformers(warranty_status))').neq('status', 'completed')),
    // Straight off transformers.warranty_status (not scoped to open notifications like
    // the KPI breakdown above) — every expired unit on record, regardless of whether it
    // currently has an open job against it. Transformers aren't department-tagged, so
    // this stays org-wide even for a department-scoped Service Manager.
    admin.from('transformers').select('id, serial_number, customers(name)').eq('warranty_status', 'expired').order('created_at', { ascending: false }).limit(8),
    // Powers the Product Requests breakdown card — one pass over every item's status.
    // Department filtering happens below (post-fetch), same reason as pendingApprovals.
    admin.from('product_request_items').select('status, product_requests(work_orders(department_id))'),
    admin.from('departments').select('id, name').order('name'),
    // Powers the "Paid Notifications" card — every Overhauling-job-type notification
    // on record (any status, not just open), matching /work-orders?job=overhauling.
    scopeWo(admin.from('work_orders').select('id, wo_number, status, department_id, customers(name)').eq('job_type', 'overhauling').order('created_at', { ascending: false }).limit(8)),
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
    ticketNumber: w.ticket_number,
    customerName: w.customers?.name || 'Unknown customer',
    scheduledDate: w.scheduled_date,
  })

  const recentNotifications = notifRows.map(w => toNotification(w))
  const overdueList = [
    ...missedRowsTyped.map(w => toNotification(w, 'missed')),
    ...atRiskRowsTyped.map(w => toNotification(w, 'at_risk_today')),
  ].slice(0, 6)
  const needsReassignList = ((needsReassignRows as unknown as BriefRow[]) || []).map(toBrief)
  const unassignedList = ((unassignedRows as unknown as BriefRow[]) || []).map(toBrief)

  type ApprovalRowRaw = { id: string; quantity: number; status: string; products: { name: string } | null; product_requests: { work_orders: { wo_number: string; department_id: string | null } | null } | null }
  const pendingApprovals: DashboardApproval[] = ((approvalRowsRaw as unknown as ApprovalRowRaw[]) || [])
    .filter(r => !departmentScope || departmentScope.includes(r.product_requests?.work_orders?.department_id || ''))
    .slice(0, 6)
    .map(r => ({
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

  type OverhaulingRow = { id: string; wo_number: string; status: string; customers: { name: string } | null }
  const overhaulingList: DashboardOverhaulingNotification[] = ((overhaulingRows as unknown as OverhaulingRow[]) || []).map(w => ({
    id: w.id,
    woNumber: w.wo_number,
    customerName: w.customers?.name || 'Unknown customer',
    status: w.status,
  }))

  type OpenWoRow = { id: string; status: string; job_type: string; department_id: string | null; work_order_transformers: { transformers: { warranty_status: string } | null }[] }
  const openWoRows = (openWorkOrderRows as unknown as OpenWoRow[]) || []
  const notificationBreakdown = {
    unassigned: openWoRows.filter(w => w.status === 'unassigned').length,
    assigned: openWoRows.filter(w => w.status === 'assigned').length,
    in_progress: openWoRows.filter(w => w.status === 'in_progress').length,
    needs_reassignment: openWoRows.filter(w => w.status === 'needs_reassignment').length,
  }

  const productRequestBreakdown = { pending: 0, approved: 0, dispatched: 0, delivered: 0 }
  type ProductRequestStatusRow = { status: string; product_requests: { work_orders: { department_id: string | null } | null } | null }
  ;((productRequestStatusRows as unknown as ProductRequestStatusRow[]) || []).forEach(r => {
    if (departmentScope && !departmentScope.includes(r.product_requests?.work_orders?.department_id || '')) return
    if (r.status === 'pending' || r.status === 'approved' || r.status === 'dispatched' || r.status === 'delivered') {
      productRequestBreakdown[r.status]++
    }
  })

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

  // Org-wide (every engineer's) open-notification count per department — unlike the
  // mobile dashboard's per-engineer department cards, this is meant for Super
  // Admin/Head of Service to see the whole org's load at a glance.
  const departments = (departmentRows as unknown as { id: string; name: string }[]) || []
  const departmentTally: Record<string, number> = {}
  let noDepartmentCount = 0
  openWoRows.forEach(w => {
    if (w.department_id) departmentTally[w.department_id] = (departmentTally[w.department_id] || 0) + 1
    else noDepartmentCount++
  })
  const departmentBreakdown: DashboardDepartmentCount[] = departments.map(d => ({
    departmentId: d.id, department: d.name, count: departmentTally[d.id] || 0,
  }))
  if (noDepartmentCount > 0) departmentBreakdown.push({ departmentId: NO_DEPARTMENT_ID, department: 'No Department', count: noDepartmentCount })

  const kpis: DashboardKpis = {
    notificationBreakdown,
    productRequestBreakdown,
    warrantyBreakdown,
    jobTypeBreakdown,
    departmentBreakdown,
  }

  return { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList, offSiteUpdates, expiredWarrantyList, overhaulingList, kpis }
}
