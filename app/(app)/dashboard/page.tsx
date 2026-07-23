import Topbar from '@/components/layout/Topbar'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getDashboardData } from '@/app/actions/get-dashboard'
import type { EngineerStatus } from '@/app/actions/get-engineers'
import { ListCard, ListRow, Badge } from '@/components/dashboard/DashboardCards'
import AssignableList from '@/components/dashboard/AssignableList'

const ENGINEER_STATUS_CFG: Record<EngineerStatus, { bg: string; color: string; label: string }> = {
  available: { bg: '#D1FAE5', color: '#065F46', label: 'Available' },
  on_leave: { bg: '#F1F5F9', color: '#475569', label: 'On Leave' },
  on_the_way: { bg: '#DBEAFE', color: '#1D4ED8', label: 'On the way' },
  travelling: { bg: '#EDE9FE', color: '#5B21B6', label: 'Travelling' },
  reached: { bg: '#FEF3C7', color: '#92400E', label: 'Reached site' },
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

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, dashboard] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getDashboardData(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'
  const { engineers, recentNotifications, pendingApprovals, overdueList, needsReassignList, unassignedList } = dashboard

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
          <ListCard title="Field Engineers" viewAllHref="/engineers" empty="No field engineers yet.">
            {engineers.slice(0, 6).map(e => {
              const cfg = ENGINEER_STATUS_CFG[e.status]
              const label = (e.status === 'on_the_way' || e.status === 'travelling' || e.status === 'reached') && e.statusSiteName
                ? `${cfg.label} — ${e.statusSiteName}` : cfg.label
              return (
                <ListRow key={e.id} title={e.name} subtitle={e.lastSeen?.placeName || 'No location yet'}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge bg={cfg.bg} color={cfg.color} label={label} />
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
          <ListCard title="Overdue follow-ups" viewAllHref="/work-orders" empty="Nothing overdue.">
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
                <span style={{ fontSize: 10, color: 'var(--txm)' }}>{wo.customerName}</span>
              </ListRow>
            ))}
          </ListCard>

          <AssignableList title="Needs reassignment" viewAllHref="/work-orders" workOrders={needsReassignList} empty="Nothing needs reassignment." />

          <AssignableList title="Unassigned" viewAllHref="/work-orders" workOrders={unassignedList} empty="Nothing unassigned." />
        </div>
      </div>
    </>
  )
}
