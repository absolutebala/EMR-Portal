'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import NewWorkOrderModal from '@/components/work-orders/NewWorkOrderModal'
import Modal from '@/components/ui/Modal'
import { deleteWorkOrder } from '@/app/actions/delete-work-order'
import { approveNotificationExpenses, rejectNotificationExpenses } from '@/app/actions/notification-approval'
import type { WorkOrderAlerts } from '@/app/actions/get-work-order-alerts'
import { ListRow, Badge } from '@/components/dashboard/DashboardCards'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import type { WorkOrder, WarrantyStatus } from '@/lib/types'
import type { Department } from '@/lib/departments'

// Matches the dashboard's NO_DEPARTMENT_ID sentinel (app/actions/get-dashboard.ts) —
// a real department is always a UUID, so this is safe as a query-param value.
const NO_DEPARTMENT_ID = 'no-department'

const WARRANTY_FILTER_LABEL: Record<string, string> = {
  under_warranty: 'under warranty',
  expired: 'AMC Expired',
  amc: 'under AMC',
}

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning',
  supervision: 'Supervision',
  overhauling: 'Overhauling',
  complaint: 'Complaint',
  installation: 'Installation',
  testing: 'Testing',
  business_opportunity: 'Business Opportunity',
}


// "Pending" is legacy-only now — a visit that couldn't be finished in a day keeps the
// notification In Progress, with scheduledDate carrying the follow-up date (shown
// below the badge). The entry stays here only so any stray legacy row still renders
// sensibly instead of falling through to the "Unassigned" fallback.
function StatusBadge({ status, scheduledDate }: { status: string; scheduledDate: string | null }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
    assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
    in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
    pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
    completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
    needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
  }
  const c = cfg[status] || cfg.unassigned
  return (
    <div>
      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
      {scheduledDate && (
        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3 }}>
          {new Date(scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      )}
    </div>
  )
}

// Signed number of days from today until the scheduled date (negative = overdue).
function daysLeftNumber(scheduledDate: string | null): number | null {
  if (!scheduledDate) return null
  const [y, m, d] = scheduledDate.slice(0, 10).split('-').map(Number)
  const sched = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((sched.getTime() - today.getTime()) / 86400000)
}

// Colour bands (per request): < 10 days → red (negatives shown with a minus),
// 10–15 → orange, > 15 → yellow.
function daysLeftInfo(scheduledDate: string | null): { label: string; color: string; bg: string } {
  const days = daysLeftNumber(scheduledDate)
  if (days === null) return { label: '—', color: 'var(--txm)', bg: 'var(--gl)' }
  if (days > 15) return { label: `${days}d`, color: '#854D0E', bg: '#FEF9C3' }      // yellow
  if (days >= 10) return { label: `${days}d`, color: '#9A3412', bg: '#FFEDD5' }      // orange
  return { label: `${days}d`, color: '#991B1B', bg: '#FEE2E2' }                      // red (incl. negatives)
}

type SortKey = 'daysLeft' | 'paid' | 'status' | 'location' | 'customer' | 'id' | 'serial' | 'job' | 'shipped' | 'engineer' | 'warranty'

// Sortable columns in render order; Actions is not sortable so it's rendered separately.
const COLUMNS: { key: SortKey; label: string; kind: 'number' | 'string' }[] = [
  { key: 'daysLeft', label: 'Days Left', kind: 'number' },
  { key: 'paid', label: 'Paid', kind: 'number' },
  { key: 'status', label: 'Status', kind: 'string' },
  { key: 'location', label: 'Location', kind: 'string' },
  { key: 'customer', label: 'Customer', kind: 'string' },
  { key: 'id', label: 'ID', kind: 'string' },
  { key: 'serial', label: 'Serial No(s)', kind: 'string' },
  { key: 'job', label: 'Job type', kind: 'string' },
  { key: 'shipped', label: 'Shipped to', kind: 'string' },
  { key: 'engineer', label: 'Engineer', kind: 'string' },
  { key: 'warranty', label: 'Warranty', kind: 'number' },
]

function sortValue(wo: WorkOrder, key: SortKey): number | string | null {
  switch (key) {
    case 'daysLeft': return daysLeftNumber(wo.scheduled_date)
    case 'paid': return wo.job_type === 'overhauling' ? 1 : 0
    case 'status': return wo.status || ''
    case 'location': return wo.customer_address || ''
    case 'customer': return wo.customer_name || ''
    case 'id': return wo.wo_number || ''
    case 'serial': return (wo.serial_numbers || []).join(', ')
    case 'job': return JOB_LABELS[wo.job_type] || wo.job_type || ''
    case 'shipped': return wo.site_name || ''
    case 'engineer': return wo.engineer_name || ''
    case 'warranty': return wo.has_warranty ? 1 : 0
  }
}

// KPI alert card that shows 3 items at a time with prev/next paging in its header.
function PagedAlertCard<T>({ title, empty, items, render }: { title: string; empty: string; items: T[]; render: (item: T) => React.ReactNode }) {
  const PER = 3
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(items.length / PER))
  const clamped = Math.min(page, totalPages - 1)
  const start = clamped * PER
  const shown = items.slice(start, start + PER)
  const navBtn = (disabled: boolean): React.CSSProperties => ({
    width: 22, height: 22, borderRadius: 6, border: '1px solid var(--gm)', background: '#fff',
    color: disabled ? 'var(--gm)' : 'var(--tx)', cursor: disabled ? 'default' : 'pointer',
    fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  })
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{title}</span>
        {items.length > PER && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--txm)', fontVariantNumeric: 'tabular-nums' }}>{start + 1}–{Math.min(start + PER, items.length)} of {items.length}</span>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={clamped === 0} style={navBtn(clamped === 0)} title="Previous">‹</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={clamped >= totalPages - 1} style={navBtn(clamped >= totalPages - 1)} title="Next">›</button>
          </div>
        )}
      </div>
      <div>
        {items.length === 0
          ? <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>{empty}</div>
          : shown.map(render)}
      </div>
    </div>
  )
}

interface Props {
  workOrders: WorkOrder[]
  engineers: { id: string; first_name: string; last_name: string }[]
  alerts: WorkOrderAlerts
  userName: string
  userRole: string
  departments: Department[]
  permissions?: Record<string, boolean>
}

export default function WorkOrdersPageClient({ workOrders, engineers, alerts, userName, userRole, departments, permissions = {} }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [jobFilter, setJobFilter] = useState(searchParams.get('job') || '')
  const [engFilter, setEngFilter] = useState(searchParams.get('engineer') || '')
  const [dateFilter, setDateFilter] = useState('')
  const [warrantyFilter, setWarrantyFilter] = useState(searchParams.get('warranty') || '')
  const [departmentFilter, setDepartmentFilter] = useState(searchParams.get('department') || '')
  const [showNew, setShowNew] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WorkOrder | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Same permission-gate semantics as the Users page.
  function can(key: string) {
    if (userRole === 'Super Admin' || userRole === 'Head of Service') return true
    if (Object.keys(permissions).length === 0) return true
    return permissions[key] === true
  }
  const canEdit = can('Notifications — Create / Edit')
  const canDelete = can('Notifications — Delete')
  // Only these roles unlock expenses on a Field-Engineer-created notification.
  const canApprove = userRole === 'Super Admin' || userRole === 'Head of Service' || userRole === 'Service Manager'
  const [approvingId, setApprovingId] = useState<string | null>(null)

  async function handleApproval(id: string, decision: 'approved' | 'rejected') {
    setApprovingId(id)
    const { error } = decision === 'approved' ? await approveNotificationExpenses(id) : await rejectNotificationExpenses(id)
    setApprovingId(null)
    if (!error) router.refresh()
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await deleteWorkOrder(confirmDelete.id)
    setDeleting(false)
    if (error) { setDeleteError(error); return }
    setConfirmDelete(null)
    router.refresh()
  }

  const filtered = useMemo(() => workOrders.filter(wo => {
    const q = search.toLowerCase()
    const matchSearch = !q || wo.wo_number.toLowerCase().includes(q) || (wo.serial_numbers?.join(' ').toLowerCase().includes(q)) || wo.customer_name?.toLowerCase().includes(q) || ''
    // Default view hides completed notifications, except field-engineer-created ones
    // whose expense approval is still pending/rejected (an admin still needs to act on
    // those). Explicitly picking a status from the dropdown overrides the hide.
    const feUnapproved = wo.expense_approval === 'pending' || wo.expense_approval === 'rejected'
    const matchStatus = statusFilter
      ? wo.status === statusFilter
      : (wo.status !== 'completed' || feUnapproved)
    const matchJob = !jobFilter || wo.job_type === jobFilter
    const matchEng = !engFilter || wo.engineer_id === engFilter
    const matchDate = !dateFilter || wo.scheduled_date === dateFilter
    const matchWarranty = !warrantyFilter || (wo.warranty_tiers || []).includes(warrantyFilter as WarrantyStatus)
    const matchDepartment = !departmentFilter || (departmentFilter === NO_DEPARTMENT_ID ? !wo.department_id : wo.department_id === departmentFilter)
    return matchSearch && matchStatus && matchJob && matchEng && matchDate && matchWarranty && matchDepartment
  }), [workOrders, search, statusFilter, jobFilter, engFilter, dateFilter, warrantyFilter, departmentFilter])

  // Default sort: soonest/most-overdue first (Days Left ascending → -8, -7, 0, 1, 2…).
  const [sortKey, setSortKey] = useState<SortKey>('daysLeft')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')) }
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      // Nulls (e.g. no scheduled date, no address) always sort to the bottom.
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir
    })
  }, [filtered, sortKey, sortDir])

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(sorted)

  return (
    <>
      <Topbar title="Notifications" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        {/* Alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <PagedAlertCard
            title="Overdue"
            empty="Nothing overdue."
            items={alerts.overdue}
            render={a => (
              <ListRow
                key={a.id}
                title={a.woNumber}
                subtitle={
                  <>
                    <div>{a.engineerName}</div>
                    {a.scheduledDate && <div>{new Date(a.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                  </>
                }
                href={`/work-orders/${a.id}`}
              >
                <span style={{ fontSize: 10, color: 'var(--txm)' }}>{a.customerName}</span>
              </ListRow>
            )}
          />

          <PagedAlertCard
            title="Needs reassignment"
            empty="Nothing needs reassignment."
            items={alerts.needsReassignment}
            render={a => (
              <ListRow key={a.id} title={a.woNumber} subtitle={a.engineerName} href={`/work-orders/${a.id}`}>
                <span style={{ fontSize: 10, color: 'var(--txm)' }}>{a.customerName}</span>
              </ListRow>
            )}
          />

          <PagedAlertCard
            title="Engineer on leave (scheduled today)"
            empty="No conflicts today."
            items={alerts.engineerOnLeave}
            render={a => (
              <ListRow key={a.id} title={a.woNumber} subtitle={a.engineerName} href={`/work-orders/${a.id}`}>
                <Badge bg="#F1F5F9" color="#475569" label="On Leave" />
              </ListRow>
            )}
          />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px', flex: 1, minWidth: 220 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO ID, serial no, customer…" style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: '100%' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All statuses</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="needs_reassignment">Need Reassign</option>
            <option value="completed">Completed</option>
          </select>
          <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All job types</option>
            {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={engFilter} onChange={e => setEngFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All engineers</option>
            {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
          </select>
          <select value={warrantyFilter} onChange={e => setWarrantyFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All warranty</option>
            <option value="under_warranty">Under Warranty</option>
            <option value="expired">Expired</option>
            <option value="amc">AMC</option>
          </select>
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value={NO_DEPARTMENT_ID}>No Department</option>
          </select>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: dateFilter ? 'var(--tx)' : 'var(--txm)' }} />
          {canEdit && (
            <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New Notification
            </button>
          )}
        </div>

        {warrantyFilter && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 10 }}>
            List of notifications that are {WARRANTY_FILTER_LABEL[warrantyFilter] || warrantyFilter}
          </div>
        )}
        {jobFilter && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 10 }}>
            List of {JOB_LABELS[jobFilter] || jobFilter} notifications
          </div>
        )}
        {departmentFilter && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 10 }}>
            List of {departmentFilter === NO_DEPARTMENT_ID ? 'No Department' : (departments.find(d => d.id === departmentFilter)?.name || 'department')} notifications
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>
              {workOrders.length === 0 ? 'No notifications yet. Click "New Notification" to create one.' : 'No notifications match your filters.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
                <thead>
                  <tr>
                    {COLUMNS.map(col => {
                      const active = sortKey === col.key
                      return (
                        <th key={col.key} onClick={() => toggleSort(col.key)} title="Sort"
                          style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: active ? 'var(--m)' : 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                          {col.label}
                          <span style={{ marginLeft: 4, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </th>
                      )
                    })}
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(wo => (
                    <tr key={wo.id} style={{ borderBottom: '1px solid var(--gm)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--mp)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                      onClick={() => router.push(`/work-orders/${wo.id}`)}>
                      {(() => { const dl = daysLeftInfo(wo.scheduled_date); return (
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: dl.bg, color: dl.color, fontVariantNumeric: 'tabular-nums' }}>{dl.label}</span>
                        </td>
                      ) })()}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {wo.job_type === 'overhauling'
                          ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#D1FAE5', color: '#065F46' }}>Yes</span>
                          : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>No</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatusBadge status={wo.status} scheduledDate={wo.scheduled_date} />
                        {wo.expense_approval === 'pending' && <div style={{ marginTop: 4, display: 'inline-block', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: '#FEF3C7', color: '#92400E' }}>Awaiting approval</div>}
                        {wo.expense_approval === 'rejected' && <div style={{ marginTop: 4, display: 'inline-block', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B' }}>Rejected</div>}
                        {wo.expense_approval === 'approved' && <div style={{ marginTop: 4, display: 'inline-block', fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: '#D1FAE5', color: '#065F46' }}>Expenses approved</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)', maxWidth: 220 }}>{wo.customer_address || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{wo.customer_name || '—'}</div>
                        {wo.customer_phone && <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 1 }}>{wo.customer_phone}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--m)', whiteSpace: 'nowrap' }}>{wo.wo_number}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)', maxWidth: 160 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(wo.serial_numbers || []).map(sn => (
                            <span key={sn} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--gl)', border: '1px solid var(--gm)', whiteSpace: 'nowrap' }}>{sn}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{JOB_LABELS[wo.job_type] || wo.job_type}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{wo.site_name || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, color: wo.engineer_name ? 'var(--tx)' : 'var(--txm)' }}>{wo.engineer_name || '—'}</div>
                        {wo.engineer_name && wo.engineer_last_seen_state && (
                          <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            {wo.engineer_last_seen_state}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {wo.has_warranty
                          ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#D1FAE5', color: '#065F46' }}>Yes</span>
                          : <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#F1F5F9', color: '#475569' }}>No</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); router.push(`/work-orders/${wo.id}`) }} title="View"
                            style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                          {canApprove && (wo.expense_approval === 'pending' || wo.expense_approval === 'rejected') && (
                            <button onClick={e => { e.stopPropagation(); handleApproval(wo.id, 'approved') }} disabled={approvingId === wo.id} title="Approve — allow expenses"
                              style={{ background: '#D1FAE5', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: approvingId === wo.id ? 'not-allowed' : 'pointer' }}>
                              <svg width="13" height="13" fill="none" stroke="#065F46" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                            </button>
                          )}
                          {canApprove && wo.expense_approval === 'pending' && (
                            <button onClick={e => { e.stopPropagation(); handleApproval(wo.id, 'rejected') }} disabled={approvingId === wo.id} title="Reject"
                              style={{ background: '#FEE2E2', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: approvingId === wo.id ? 'not-allowed' : 'pointer' }}>
                              <svg width="13" height="13" fill="none" stroke="#991B1B" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={e => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(wo) }} title="Delete notification"
                              style={{ background: '#FEE2E2', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <svg width="12" height="12" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
      </div>

      <NewWorkOrderModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => router.refresh()} />

      {confirmDelete && (
        <Modal open onClose={() => { if (!deleting) setConfirmDelete(null) }} title="Delete notification">
          <div style={{ fontSize: 13, color: 'var(--tx)', marginBottom: 8 }}>
            Delete notification <strong>{confirmDelete.wo_number}</strong>? This permanently removes the notification and all of its data — check-ins, closures, submitted forms, product requests and expenses. This cannot be undone.
          </div>
          {deleteError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 10 }}>{deleteError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button onClick={() => setConfirmDelete(null)} disabled={deleting}
              style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#DC2626', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: deleting ? 0.7 : 1 }}>
              {deleting ? 'Deleting…' : 'Delete notification'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
