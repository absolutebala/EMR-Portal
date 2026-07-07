import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CustomerInfoClient from '@/components/customers/CustomerInfoClient'
import TransformerTableClient from '@/components/customers/TransformerTableClient'
import Link from 'next/link'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: customer }, { data: sites }, { data: transformers }, { data: { user } }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).single(),
    supabase.from('customer_sites').select('*').eq('customer_id', id),
    supabase.from('transformers').select('*').eq('customer_id', id),
    supabase.auth.getUser(),
  ])

  if (!customer) notFound()

  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', user!.id).single()
  const userName = profile ? `${profile.first_name} ${profile.last_name}` : 'User'
  const userRole = profile?.role || 'User'

  const { data: roleData } = await supabase.from('roles').select('permissions').eq('name', userRole).maybeSingle()
  const permissions = (roleData?.permissions as Record<string, boolean> | null) ?? {}
  const hasPerms = Object.keys(permissions).length > 0
  const canEdit = !hasPerms || permissions['Customers — Create / Edit'] !== false

  return (
    <>
      <Topbar title={customer.name} userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <Link href="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txm)', textDecoration: 'none', marginBottom: 16 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to customers
        </Link>

        {/* Top row: info card + stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
          <CustomerInfoClient customer={customer} canEdit={canEdit} />

          <div>
            {[
              { label: 'Sites', val: sites?.length || 0, color: 'var(--m)' },
              { label: 'Transformers', val: transformers?.length || 0, color: 'var(--blue)' },
              { label: 'Work orders', val: 0, color: 'var(--amber)', stub: true },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }}/>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--tx)' }}>{s.val}</div>
                {s.stub && <div style={{ fontSize: 10, color: 'var(--txm)' }}>Available next sprint</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Full-width transformer table */}
        <TransformerTableClient
          customer={customer}
          sites={sites || []}
          transformers={transformers || []}
          canEdit={canEdit}
        />

        {/* Service history placeholder */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 32, textAlign: 'center' }}>
          <svg width="40" height="40" fill="none" stroke="var(--gm)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 12px' }}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txm)' }}>No service history yet</div>
          <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 4 }}>Work orders will appear here once the Work Orders module is built.</div>
        </div>
      </div>
    </>
  )
}
