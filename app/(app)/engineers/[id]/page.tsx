import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { getEngineerProfile } from '@/app/actions/get-engineers'
import { getWorkOrders } from '@/app/actions/get-work-orders'
import { getExpenseLogsForEngineer } from '@/app/actions/expenses'
import { getProductRequestsForEngineer } from '@/app/actions/products'
import { getMyPermissions } from '@/app/actions/roles-actions'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'
import EngineerExpensesTable from '@/components/engineers/EngineerExpensesTable'
import EngineerProductRequestsTable from '@/components/engineers/EngineerProductRequestsTable'
import { adminClient } from '@/lib/db/admin-client'

const ENGINEER_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#D1FAE5', color: '#065F46', label: 'Available' },
  on_leave: { bg: '#F1F5F9', color: '#475569', label: 'On Leave' },
  on_the_way: { bg: '#DBEAFE', color: '#1D4ED8', label: 'On the way' },
  travelling: { bg: '#EDE9FE', color: '#5B21B6', label: 'Travelling' },
  reached: { bg: '#FEF3C7', color: '#92400E', label: 'Reached project' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
}

const WO_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
  assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx)' }}>{value}</div>
    </div>
  )
}

export default async function EngineerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ profile }, user, { workOrders: notifications }, { logs: expenses }, { requests: productRequests }, { permissions, role }] = await Promise.all([
    getEngineerProfile(id),
    getAuthedUser(supabase),
    getWorkOrders(undefined, id),
    getExpenseLogsForEngineer(id),
    getProductRequestsForEngineer(id),
    getMyPermissions(),
  ])

  if (!profile) notFound()

  const { data: viewerProfile } = await adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = viewerProfile ? `${viewerProfile.first_name} ${viewerProfile.last_name}` : 'User'
  const userRole = viewerProfile?.role || role || 'User'

  const hasPerms = Object.keys(permissions).length > 0
  const isAdmin = userRole === 'Super Admin' || userRole === 'Head of Service'
  const canApproveAsManager = isAdmin || !hasPerms || permissions['Expenses — Approve'] === true
  const canApproveAsHead = isAdmin || !hasPerms || permissions['Expenses — Final Approve'] === true
  const canApproveRequests = isAdmin || !hasPerms || permissions['Product Requests — Approve'] === true
  const canDispatchRequests = isAdmin || !hasPerms || permissions['Product Requests — Dispatch'] === true
  const canDeliverRequests = isAdmin || !hasPerms || permissions['Product Requests — Deliver'] === true

  const openNotifications = notifications.filter(w => w.status !== 'completed').length
  const closedNotifications = notifications.filter(w => w.status === 'completed').length
  const totalExpenseRequested = expenses.reduce((sum, e) => sum + e.amount, 0)
  const pendingExpenseAmount = expenses.filter(e => e.status === 'pending' || e.status === 'manager_approved').reduce((sum, e) => sum + e.amount, 0)
  const overLimitCount = expenses.filter(e => e.overLimit).length
  const pendingProductItems = productRequests.flatMap(r => r.items).filter(i => i.status === 'pending').length

  const statusCfg = ENGINEER_STATUS_CFG[profile.status] || ENGINEER_STATUS_CFG.available
  const statusLabel = (profile.status === 'on_the_way' || profile.status === 'travelling' || profile.status === 'reached') && profile.statusSiteName
    ? `${statusCfg.label} — ${profile.statusSiteName}` : statusCfg.label

  return (
    <>
      <Topbar title={profile.name} subtitle={profile.employeeId} userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <Link href="/engineers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txm)', textDecoration: 'none', marginBottom: 16 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          Back to field engineers
        </Link>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
          <KpiCard label="Open notifications" value={openNotifications} color="#D97706" />
          <KpiCard label="Closed notifications" value={closedNotifications} color="#059669" />
          <KpiCard label="Total expense requested" value={formatAmount(totalExpenseRequested)} color="#7D1D3F" />
          <KpiCard label="Pending expense amount" value={formatAmount(pendingExpenseAmount)} color="#D97706" />
          <KpiCard label="Over policy limit claims" value={overLimitCount} color="#991B1B" />
          <KpiCard label="Pending product requests" value={pendingProductItems} color="#1D4ED8" />
        </div>

        {/* Profile card */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: statusCfg.bg, color: statusCfg.color }}>{statusLabel}</span>
              {profile.statusStartBy && (profile.status === 'on_the_way' || profile.status === 'travelling') && (
                <span style={{ fontSize: 11, color: 'var(--txm)' }}>Starting by {new Date(profile.statusStartBy).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            {profile.lastSeen && (
              <span style={{ fontSize: 11, color: 'var(--txm)' }}>
                Last seen: {profile.lastSeen.placeName || 'Unknown location'} · {formatDateTime(profile.lastSeen.at)}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { label: 'Employee ID', val: profile.employeeId },
              { label: 'Phone', val: profile.phone || '—' },
              { label: 'Email', val: profile.email || '—' },
              { label: 'Grade', val: profile.grade || '—' },
              { label: 'Role', val: profile.role },
              { label: 'Reporting manager', val: profile.managerName || '—' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 13, color: 'var(--tx)' }}>{f.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Notifications</div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No notifications assigned yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Notification', 'Customer', 'Job type', 'Status', 'Scheduled'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notifications.map(wo => {
                  const cfg = WO_STATUS_CFG[wo.status] || WO_STATUS_CFG.unassigned
                  return (
                    <tr key={wo.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <Link href={`/work-orders/${wo.id}`} style={{ fontSize: 12, fontWeight: 500, color: 'var(--m)', textDecoration: 'none' }}>{wo.wo_number}</Link>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{wo.customer_name}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{JOB_TYPE_LABELS[wo.job_type] || wo.job_type}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{wo.scheduled_date ? formatDate(wo.scheduled_date) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Expenses */}
        <EngineerExpensesTable expenses={expenses} canApproveAsManager={canApproveAsManager} canApproveAsHead={canApproveAsHead} />

        {/* Product requests */}
        <EngineerProductRequestsTable requests={productRequests} canApprove={canApproveRequests} canDispatch={canDispatchRequests} canDeliver={canDeliverRequests} />
      </div>
    </>
  )
}
