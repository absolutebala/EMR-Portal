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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 12 }}>Getting started</div>
            {[
              { step: 1, text: 'Configure Settings — update org name, logo and branding', done: false },
              { step: 2, text: 'Add Users — invite your team with role-based access', done: false },
              { step: 3, text: 'Add Customers — register client organisations and sites', done: false },
              { step: 4, text: 'Review the seeded MOM form in the Forms module', done: false },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gm)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: item.done ? 'var(--green)' : 'var(--mp)', border: `2px solid ${item.done ? 'var(--green)' : 'var(--mb)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: item.done ? '#fff' : 'var(--m)', flexShrink: 0 }}>
                  {item.step}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx)', paddingTop: 2 }}>{item.text}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginBottom: 12 }}>Sprint 1 modules</div>
            {[
              { name: 'Users', status: 'Live', path: '/users' },
              { name: 'Customers', status: 'Live', path: '/customers' },
              { name: 'Settings', status: 'Live', path: '/settings' },
              { name: 'Forms (Form Builder)', status: 'Live', path: '/forms' },
              { name: 'Work Orders', status: 'Sprint 2' },
              { name: 'Field Engineers', status: 'Sprint 2' },
              { name: 'Products (SAP)', status: 'Sprint 2' },
            ].map(m => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--gm)' }}>
                <span style={{ fontSize: 12, color: 'var(--tx)' }}>{m.name}</span>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: m.status === 'Live' ? '#D1FAE5' : 'var(--gl)', color: m.status === 'Live' ? '#065F46' : 'var(--txm)' }}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
