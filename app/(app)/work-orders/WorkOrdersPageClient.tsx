'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import NewWorkOrderModal from '@/components/work-orders/NewWorkOrderModal'
import Modal from '@/components/ui/Modal'
import { deleteWorkOrder } from '@/app/actions/delete-work-order'
import { approveNotificationExpenses, rejectNotificationExpenses } from '@/app/actions/notification-approval'
import type { WorkOrderAlerts } from '@/app/actions/get-work-order-alerts'
import { ListCard, ListRow, Badge } from '@/components/dashboard/DashboardCards'
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

// Days from today until the notification's scheduled date. Colour bands (per request):
// < 10 days → red (negatives shown with a minus), 10–15 → orange, > 15 → yellow.
function daysLeftInfo(scheduledDate: string | null): { label: string; color: string; bg: string } {
  if (!scheduledDate) return { label: '—', color: 'var(--txm)', bg: 'var(--gl)' }
  const [y, m, d] = scheduledDate.slice(0, 10).split('-').map(Number)
  const sched = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((sched.getTime() - today.getTime()) / 86400000)
  if (days > 15) return { label: `${days}d`, color: '#854D0E', bg: '#FEF9C3' }      // yellow
  if (days >= 10) return { label: `${days}d`, color: '#9A3412', bg: '#FFEDD5' }      // orange
  return { label: `${days}d`, color: '#991B1B', bg: '#FEE2E2' }                      // red (incl. negatives)
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
    const matchStatus = !statusFilter || wo.status === statusFilter
    const matchJob = !jobFilter || wo.job_type === jobFilter
    const matchEng = !engFilter || wo.engineer_id === engFilter
    const matchDate = !dateFilter || wo.scheduled_date === dateFilter
    const matchWarranty = !warrantyFilter || (wo.warranty_tiers || []).includes(warrantyFilter as WarrantyStatus)
    const matchDepartment = !departmentFilter || (departmentFilter === NO_DEPARTMENT_ID ? !wo.department_id : wo.department_id === departmentFilter)
    return matchSearch && matchStatus && matchJob && matchEng && matchDate && matchWarranty && matchDepartment
  }), [workOrders, search, statusFilter, jobFilter, engFilter, dateFilter, warrantyFilter, departmentFilter])

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered)

  return (
    <>
      <Topbar title="Notifications" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        {/* Alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <ListCard title="Overdue" empty="Nothing overdue.">
            {alerts.overdue.map(a => (
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
            ))}
          </ListCard>

          <ListCard title="Needs reassignment" empty="Nothing needs reassignment.">
            {alerts.needsReassignment.map(a => (
              <ListRow key={a.id} title={a.woNumber} subtitle={a.engineerName} href={`/work-orders/${a.id}`}>
                <span style={{ fontSize: 10, color: 'var(--txm)' }}>{a.customerName}</span>
              </ListRow>
            ))}
          </ListCard>

          <ListCard title="Engineer on leave (scheduled today)" empty="No conflicts today.">
            {alerts.engineerOnLeave.map(a => (
              <ListRow key={a.id} title={a.woNumber} subtitle={a.engineerName} href={`/work-orders/${a.id}`}>
                <Badge bg="#F1F5F9" color="#475569" label="On Leave" />
              </ListRow>
            ))}
          </ListCard>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    {['Days Left', 'Paid', 'Status', 'Location', 'Customer', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
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
