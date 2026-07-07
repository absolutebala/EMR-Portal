import Topbar from '@/components/layout/Topbar'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
  const { count: customerCount } = await supabase.from('customers').select('*', { count: 'exact', head: true })
  const { count: formCount } = await supabase.from('forms').select('*', { count: 'exact', head: true })

  const stats = [
    { label: 'Total users', val: userCount ?? 0, color: 'var(--m)' },
    { label: 'Customers', val: customerCount ?? 0, color: 'var(--blue)' },
    { label: 'Active forms', val: formCount ?? 0, color: 'var(--green)' },
    { label: 'Work orders', val: 0, color: 'var(--amber)', stub: true },
    { label: 'Engineers', val: 0, color: '#7C3AED', stub: true },
  ]

  return (
    <>
      <Topbar title="Dashboard" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }}/>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{s.val}</div>
              {s.stub && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3 }}>Available next sprint</div>}
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
