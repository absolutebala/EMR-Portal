import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getDashboardData } from '@/app/actions/get-dashboard'
import type { EngineerStatus } from '@/app/actions/get-engineers'

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

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getAuthedUser(supabase)

  const [{ data: profile }, dashboard] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single(),
    getDashboardData(),
  ])

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'
  const { stats: s, engineers, attention: a, recentNotifications, pendingApprovals } = dashboard

  const stats = [
    { label: 'Total users', val: s.userCount, color: 'var(--m)' },
    { label: 'Customers', val: s.customerCount, color: 'var(--blue)' },
    { label: 'Active forms', val: s.formCount, color: 'var(--green)' },
    { label: 'Open notifications', val: s.openNotifCount, color: 'var(--amber)' },
    { label: 'Field engineers', val: engineers.length, color: '#7C3AED' },
  ]

  const attention = [
    { label: 'Overdue follow-ups', val: a.overdueCount, color: 'var(--red)', bg: '#FEE2E2', href: '/work-orders' },
    { label: 'Needs reassignment', val: a.needsReassignCount, color: '#EA580C', bg: '#FED7AA', href: '/work-orders' },
    { label: 'Unassigned', val: a.unassignedCount, color: 'var(--amber)', bg: '#FEF3C7', href: '/work-orders' },
    { label: 'Product requests pending', val: a.pendingApprovalCount, color: '#1D4ED8', bg: '#DBEAFE', href: '/requests' },
  ]

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }}>
          {stats.map(st => (
            <div key={st.label} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: st.color }} />
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{st.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{st.val}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
          Needs your attention
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {attention.map(at => (
            <Link key={at.label} href={at.href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow .15s',
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: at.val > 0 ? at.color : 'var(--tx)', lineHeight: 1, marginBottom: 5 }}>{at.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--txm)', fontWeight: 500 }}>{at.label}</div>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: at.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={at.color} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 24 }}>
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
                      {wo.scheduledDate && (
                        <div>{new Date(wo.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      )}
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
      </div>
    </>
  )
}

function ListCard({ title, viewAllHref, empty, children }: { title: string; viewAllHref: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{title}</span>
        <Link href={viewAllHref} style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500, textDecoration: 'none' }}>View all →</Link>
      </div>
      <div>
        {hasContent ? children : (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>{empty}</div>
        )}
      </div>
    </div>
  )
}

function ListRow({ title, subtitle, href, children }: { title: string; subtitle?: React.ReactNode; href?: string; children?: React.ReactNode }) {
  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--gl)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 1, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link> : content
}

function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}
