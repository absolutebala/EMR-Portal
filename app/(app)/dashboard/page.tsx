import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { createClient, getAuthedUser } from '@/lib/supabase/server'
import { getFieldEngineersOverview } from '@/app/actions/get-engineers'

export default async function DashboardPage() {
  const supabase = await createClient()
  const todayStr = new Date().toLocaleDateString('en-CA')

  // Run auth + all counts in parallel — no sequential waterfall. Field engineer count
  // reuses getFieldEngineersOverview() (roster built from real activity, not a naive
  // role='Field Engineer' filter) — a plain profiles count by role has previously
  // undercounted engineers whose stored role string didn't match exactly, per the
  // existing warning comment in get-engineers.ts.
  const [
    user,
    { count: userCount },
    { count: customerCount },
    { count: formCount },
    { count: openNotifCount },
    { engineers: engineerRoster },
    { count: overdueCount },
    { count: needsReassignCount },
    { count: unassignedCount },
    { count: pendingApprovalCount },
  ] = await Promise.all([
    getAuthedUser(supabase),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('forms').select('*', { count: 'exact', head: true }),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
    getFieldEngineersOverview(),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'in_progress').lt('scheduled_date', todayStr),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'needs_reassignment'),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('status', 'unassigned'),
    supabase.from('product_request_items').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const engineerCount = engineerRoster.length

  const { data: profile } = await supabase
    .from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()

  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const stats = [
    { label: 'Total users', val: userCount ?? 0, color: 'var(--m)' },
    { label: 'Customers', val: customerCount ?? 0, color: 'var(--blue)' },
    { label: 'Active forms', val: formCount ?? 0, color: 'var(--green)' },
    { label: 'Open notifications', val: openNotifCount ?? 0, color: 'var(--amber)' },
    { label: 'Field engineers', val: engineerCount, color: '#7C3AED' },
  ]

  const attention = [
    { label: 'Overdue follow-ups', val: overdueCount ?? 0, color: 'var(--red)', bg: '#FEE2E2', href: '/work-orders' },
    { label: 'Needs reassignment', val: needsReassignCount ?? 0, color: '#EA580C', bg: '#FED7AA', href: '/work-orders' },
    { label: 'Unassigned', val: unassignedCount ?? 0, color: 'var(--amber)', bg: '#FEF3C7', href: '/work-orders' },
    { label: 'Product requests pending', val: pendingApprovalCount ?? 0, color: '#1D4ED8', bg: '#DBEAFE', href: '/requests' },
  ]

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
          Needs your attention
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {attention.map(a => (
            <Link key={a.label} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow .15s',
              }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: a.val > 0 ? a.color : 'var(--tx)', lineHeight: 1, marginBottom: 5 }}>{a.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--txm)', fontWeight: 500 }}>{a.label}</div>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
