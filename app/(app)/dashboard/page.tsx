import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { getAuthedUser } from '@/lib/cognito/server'
import { getDashboardData } from '@/app/actions/get-dashboard'
import type { EngineerStatus } from '@/app/actions/get-engineers'
import { ListCard, ListRow, Badge, BreakdownCard } from '@/components/dashboard/DashboardCards'
import AssignableList from '@/components/dashboard/AssignableList'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'
import { adminClient } from '@/lib/db/admin-client'

const NOTIFICATION_BREAKDOWN_CFG: { key: 'unassigned' | 'assigned' | 'in_progress' | 'needs_reassignment'; label: string; color: string; href: string }[] = [
  { key: 'unassigned', label: 'Unassigned', color: '#6B7280', href: '/work-orders?status=unassigned' },
  { key: 'assigned', label: 'Assigned', color: '#1D4ED8', href: '/work-orders?status=assigned' },
  { key: 'in_progress', label: 'In Progress', color: '#D97706', href: '/work-orders?status=in_progress' },
  { key: 'needs_reassignment', label: 'Needs Reassignment', color: '#9A3412', href: '/work-orders?status=needs_reassignment' },
]

const PRODUCT_REQUEST_BREAKDOWN_CFG: { key: 'pending' | 'approved' | 'dispatched' | 'delivered'; label: string; color: string; href: string }[] = [
  { key: 'pending', label: 'Requested', color: '#92400E', href: '/requests?tab=pending' },
  { key: 'approved', label: 'Approved', color: '#1D4ED8', href: '/requests?tab=approved' },
  { key: 'dispatched', label: 'Dispatched', color: '#5B21B6', href: '/requests?tab=dispatched' },
  { key: 'delivered', label: 'Delivered', color: '#065F46', href: '/requests?tab=delivered' },
]

const WARRANTY_TIER_CFG: { key: 'under_warranty' | 'expired' | 'amc'; label: string; color: string }[] = [
  { key: 'under_warranty', label: 'Under Warranty', color: '#065F46' },
  { key: 'expired', label: 'Expired', color: '#991B1B' },
  { key: 'amc', label: 'AMC', color: '#1D4ED8' },
]

const WARRANTY_BADGE_CFG: Record<string, { bg: string; color: string; label: string }> = {
  under_warranty: { bg: '#D1FAE5', color: '#065F46', label: 'Under Warranty' },
  expired: { bg: '#FEE2E2', color: '#991B1B', label: 'Expired' },
  amc: { bg: '#DBEAFE', color: '#1D4ED8', label: 'AMC' },
}

const PRODUCT_REQUEST_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  dispatched: { bg: '#EDE9FE', color: '#5B21B6', label: 'Dispatched' },
}

const ENGINEER_STATUS_CFG: Record<EngineerStatus, { bg: string; color: string; label: string }> = {
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
  pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default async function DashboardPage() {
  const user = await getAuthedUser()

  const [{ data: profile }, dashboard] = await Promise.all([
    adminClient().from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getDashboardData(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'
  const { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList, offSiteUpdates, expiredWarrantyList, overhaulingList, kpis } = dashboard
  const warrantyTotal = kpis.warrantyBreakdown.under_warranty + kpis.warrantyBreakdown.expired + kpis.warrantyBreakdown.amc
  const notificationTotal = kpis.notificationBreakdown.unassigned + kpis.notificationBreakdown.assigned + kpis.notificationBreakdown.in_progress + kpis.notificationBreakdown.needs_reassignment
  const productRequestTotal = kpis.productRequestBreakdown.pending + kpis.productRequestBreakdown.approved + kpis.productRequestBreakdown.dispatched + kpis.productRequestBreakdown.delivered
  // Org-wide department load is only meaningful for the two roles who oversee every
  // department at once — everyone else already sees their own department's work
  // through the notification list itself.
  const showDepartmentCards = userRole === 'Super Admin' || userRole === 'Head of Service'
  const DEPARTMENT_CARD_COLORS = ['#2563EB', '#D97706', '#7D1D3F', '#059669', '#5B21B6', '#EA580C', '#475569']

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
          <BreakdownCard
            title="Notifications" total={notificationTotal} borderColor="#D97706"
            rows={NOTIFICATION_BREAKDOWN_CFG.map(s => ({ key: s.key, label: s.label, count: kpis.notificationBreakdown[s.key], color: s.color, href: s.href }))}
          />
          <BreakdownCard
            title="Product Requests" total={productRequestTotal} borderColor="#7D1D3F"
            rows={PRODUCT_REQUEST_BREAKDOWN_CFG.map(s => ({ key: s.key, label: s.label, count: kpis.productRequestBreakdown[s.key], color: s.color, href: s.href }))}
          />
          <BreakdownCard
            title="Warranty Status" total={warrantyTotal} borderColor="#7D1D3F"
            rows={WARRANTY_TIER_CFG.map(t => ({ key: t.key, label: t.label, count: kpis.warrantyBreakdown[t.key], color: t.color, href: `/work-orders?warranty=${t.key}` }))}
          />
        </div>

        {showDepartmentCards && kpis.departmentBreakdown.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Open notifications by department</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {kpis.departmentBreakdown.map((d, i) => {
                const color = DEPARTMENT_CARD_COLORS[i % DEPARTMENT_CARD_COLORS.length]
                return (
                  <Link
                    key={d.departmentId}
                    href={`/work-orders?department=${d.departmentId}`}
                    style={{ textDecoration: 'none', background: '#fff', borderRadius: 12, padding: 14, border: '1px solid var(--gm)', borderTop: `3px solid ${color}` }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{d.count}</div>
                    <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 4 }}>{d.department}</div>
                    <div style={{ fontSize: 9, color: 'var(--txm)', marginTop: 1 }}>open</div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {kpis.jobTypeBreakdown.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--gm)', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Open notifications by job type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kpis.jobTypeBreakdown.map(jt => (
                <Link
                  key={jt.jobType}
                  href={`/work-orders?job=${jt.jobType}`}
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 20, border: '1px solid var(--gm)', background: 'var(--gl)' }}
                >
                  <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{JOB_TYPE_LABELS[jt.jobType] || jt.jobType}</span>
                  <span style={{ fontSize: 12, color: '#fff', background: 'var(--m)', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{jt.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
          <ListCard title="Expired Warranty" viewAllHref="/work-orders?warranty=expired" empty="No transformers with expired warranty.">
            {expiredWarrantyList.map(t => (
              <ListRow key={t.id} title={t.customerName} subtitle={t.serialNumber} />
            ))}
          </ListCard>

          <ListCard title="Paid Notifications" viewAllHref="/work-orders?job=overhauling" empty="No Overhauling notifications.">
            {overhaulingList.map(wo => {
              const cfg = WO_STATUS_CFG[wo.status] || WO_STATUS_CFG.unassigned
              return (
                <ListRow key={wo.id} title={wo.woNumber} subtitle={wo.customerName} href={`/work-orders/${wo.id}`}>
                  <Badge bg={cfg.bg} color={cfg.color} label={cfg.label} />
                </ListRow>
              )
            })}
          </ListCard>

          <ListCard title="Off-site status updates" empty="No off-site updates — engineers are updating jobs from the site as expected.">
            {offSiteUpdates.map(u => (
              <ListRow key={u.id} title={u.actorName} subtitle={formatDateTime(u.createdAt)}>
                <span style={{ fontSize: 11, color: 'var(--txm)', textAlign: 'right', maxWidth: 320 }}>{u.action}</span>
              </ListRow>
            ))}
          </ListCard>

          <ListCard title="Product requests" viewAllHref="/requests" empty="No product requests in progress.">
            {pendingApprovals.map(ap => {
              const pcfg = PRODUCT_REQUEST_STATUS_CFG[ap.status] || PRODUCT_REQUEST_STATUS_CFG.pending
              return (
                <ListRow key={ap.id} title={`${ap.productName} × ${ap.quantity}`} subtitle={ap.woNumber} href="/requests">
                  <Badge bg={pcfg.bg} color={pcfg.color} label={pcfg.label} />
                </ListRow>
              )
            })}
          </ListCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <ListCard title="Missed & at-risk follow-ups" viewAllHref="/work-orders" empty="Nothing missed or at risk.">
            {overdueList.map(wo => (
              <ListRow
                key={wo.id}
                title={wo.woNumber}
                subtitle={
                  <>
                    <div>{wo.engineerName}</div>
                    {wo.scheduledDate && <div>{formatDate(wo.scheduledDate)}</div>}
                  </>
                }
                href={`/work-orders/${wo.id}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600,
                    background: wo.alertReason === 'missed' ? '#FEE2E2' : '#FEF3C7',
                    color: wo.alertReason === 'missed' ? '#991B1B' : '#92400E',
                  }}>
                    {wo.alertReason === 'missed' ? 'Missed' : 'Due today'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--txm)' }}>{wo.customerName}</span>
                </div>
              </ListRow>
            ))}
          </ListCard>

          <AssignableList title="Needs reassignment" viewAllHref="/work-orders" workOrders={needsReassignList} empty="Nothing needs reassignment." />

          <AssignableList title="Unassigned" viewAllHref="/work-orders" workOrders={unassignedList} empty="Nothing unassigned." showScheduleInfo />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <ListCard title="Field Engineers" viewAllHref="/engineers" empty="No field engineers yet.">
            {engineers.slice(0, 6).map(e => {
              const cfg = ENGINEER_STATUS_CFG[e.status]
              // A job scheduled for today takes priority over the plain "Available"
              // label — an engineer who hasn't tapped "On the way" yet still has
              // something lined up, so "Available" would be misleading.
              const scheduledToday = e.status === 'available' && e.scheduledTodayCustomer
              const label = scheduledToday
                ? `Scheduled to ${e.scheduledTodayCustomer}`
                : (e.status === 'on_the_way' || e.status === 'travelling' || e.status === 'reached' || e.status === 'completed') && e.statusSiteName
                  ? `${cfg.label} — ${e.statusSiteName}` : cfg.label
              const badgeBg = scheduledToday ? '#DBEAFE' : cfg.bg
              const badgeColor = scheduledToday ? '#1D4ED8' : cfg.color
              const showsStartBy = (e.status === 'on_the_way' || e.status === 'travelling') && e.statusStartBy
              return (
                <ListRow key={e.id} title={e.name} subtitle={e.lastSeen?.placeName || 'No location yet'}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge bg={badgeBg} color={badgeColor} label={label} />
                    {showsStartBy && <span style={{ fontSize: 10, color: 'var(--txm)' }}>Starting by {formatTime(e.statusStartBy!)}</span>}
                    <span style={{ fontSize: 10, color: 'var(--txm)' }}>{e.openWorkOrders} open job{e.openWorkOrders !== 1 ? 's' : ''}</span>
                  </div>
                </ListRow>
              )
            })}
          </ListCard>

          <ListCard title="Notifications" viewAllHref="/work-orders" empty="No open notifications.">
            {recentNotifications.map(wo => {
              const cfg = WO_STATUS_CFG[wo.status] || WO_STATUS_CFG.unassigned
              return (
                <ListRow
                  key={wo.id}
                  title={wo.woNumber}
                  subtitle={
                    <>
                      <div>{wo.engineerName}</div>
                      {wo.scheduledDate && <div>{formatDate(wo.scheduledDate)}</div>}
                      {wo.transformers.map(t => {
                        const wcfg = WARRANTY_BADGE_CFG[t.warrantyStatus]
                        return wcfg ? (
                          <div key={t.serialNumber} style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9.5, color: 'var(--txm)' }}>{t.serialNumber}</span>
                            <Badge bg={wcfg.bg} color={wcfg.color} label={wcfg.label} />
                          </div>
                        ) : null
                      })}
                    </>
                  }
                  href={`/work-orders/${wo.id}`}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge bg={cfg.bg} color={cfg.color} label={cfg.label} />
                    <span style={{ fontSize: 10, color: 'var(--txm)' }}>{wo.customerName}</span>
                  </div>
                </ListRow>
              )
            })}
          </ListCard>
        </div>
      </div>
    </>
  )
}
