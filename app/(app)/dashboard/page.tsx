import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getDashboardData } from '@/app/actions/get-dashboard'
import type { EngineerStatus } from '@/app/actions/get-engineers'
import { ListCard, ListRow, Badge } from '@/components/dashboard/DashboardCards'
import AssignableList from '@/components/dashboard/AssignableList'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'

const KPI_CARDS: { key: 'inProgressCount' | 'unassignedCount' | 'pendingProductRequestsCount'; label: string; href: string; color: string; bg: string }[] = [
  { key: 'inProgressCount', label: 'In Progress', href: '/work-orders?status=in_progress', color: '#D97706', bg: '#FEF3C7' },
  { key: 'unassignedCount', label: 'Unassigned', href: '/work-orders?status=unassigned', color: '#6B7280', bg: '#F3F4F6' },
  { key: 'pendingProductRequestsCount', label: 'Pending Product Requests', href: '/requests', color: '#7D1D3F', bg: '#F9EEF2' },
]

const WARRANTY_TIER_CFG: { key: 'under_warranty' | 'expired' | 'amc'; label: string; color: string }[] = [
  { key: 'under_warranty', label: 'Under Warranty', color: '#065F46' },
  { key: 'expired', label: 'Expired', color: '#991B1B' },
  { key: 'amc', label: 'AMC', color: '#1D4ED8' },
]

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
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, dashboard] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getDashboardData(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'
  const { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList, offSiteUpdates, kpis } = dashboard
  const warrantyTotal = kpis.warrantyBreakdown.under_warranty + kpis.warrantyBreakdown.expired + kpis.warrantyBreakdown.amc

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
          {KPI_CARDS.map(card => (
            <Link key={card.key} href={card.href} style={{ textDecoration: 'none', background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--gm)', borderTop: `3px solid ${card.color}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{kpis[card.key]}</div>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 6, fontWeight: 500 }}>{card.label}</div>
            </Link>
          ))}

          <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--gm)', borderTop: '3px solid #7D1D3F', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 8, fontWeight: 500 }}>Warranty Status ({warrantyTotal})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {WARRANTY_TIER_CFG.map(tier => (
                <Link key={tier.key} href={`/work-orders?warranty=${tier.key}`} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--txm)' }}>{tier.label}</span>
                  <span style={{ fontWeight: 700, color: tier.color }}>{kpis.warrantyBreakdown[tier.key]}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
          <ListCard title="Field Engineers" viewAllHref="/engineers" empty="No field engineers yet.">
            {engineers.slice(0, 6).map(e => {
              const cfg = ENGINEER_STATUS_CFG[e.status]
              const label = (e.status === 'on_the_way' || e.status === 'travelling' || e.status === 'reached' || e.status === 'completed') && e.statusSiteName
                ? `${cfg.label} — ${e.statusSiteName}` : cfg.label
              const showsStartBy = (e.status === 'on_the_way' || e.status === 'travelling') && e.statusStartBy
              return (
                <ListRow key={e.id} title={e.name} subtitle={e.lastSeen?.placeName || 'No location yet'}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge bg={cfg.bg} color={cfg.color} label={label} />
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

          <ListCard title="Product request approvals" viewAllHref="/requests" empty="Nothing pending approval.">
            {pendingApprovals.map(ap => (
              <ListRow key={ap.id} title={`${ap.productName} × ${ap.quantity}`} subtitle={ap.woNumber} href="/requests" />
            ))}
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

          <AssignableList title="Unassigned" viewAllHref="/work-orders" workOrders={unassignedList} empty="Nothing unassigned." />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginTop: 14 }}>
          <ListCard title="Off-site status updates" empty="No off-site updates — engineers are updating jobs from the site as expected.">
            {offSiteUpdates.map(u => (
              <ListRow key={u.id} title={u.actorName} subtitle={formatDateTime(u.createdAt)}>
                <span style={{ fontSize: 11, color: 'var(--txm)', textAlign: 'right', maxWidth: 320 }}>{u.action}</span>
              </ListRow>
            ))}
          </ListCard>
        </div>
      </div>
    </>
  )
}
