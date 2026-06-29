import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { CustomerTypeBadge } from '@/components/ui/Badge'
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

  const warrantyLabels: Record<string, { label: string; bg: string; color: string }> = {
    under_warranty: { label: 'Under warranty', bg: '#D1FAE5', color: '#065F46' },
    expired: { label: 'Expired', bg: '#FEE2E2', color: '#991B1B' },
    amc: { label: 'AMC', bg: '#DBEAFE', color: '#1E40AF' },
  }

  return (
    <>
      <Topbar title={customer.name} userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        {/* Back */}
        <Link href="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--txm)', textDecoration: 'none', marginBottom: 16 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to customers
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* Info card */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {customer.name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>{customer.name}</div>
                <CustomerTypeBadge type={customer.type}/>
              </div>
            </div>
            {[
              ['Contact person', customer.contact_person],
              ['Designation', customer.designation || '—'],
              ['Phone', customer.phone],
              ['Email', customer.email || '—'],
              ['WhatsApp', customer.whatsapp_number || '—'],
              ['SAP code', customer.sap_customer_code || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gm)', fontSize: 12 }}>
                <span style={{ color: 'var(--txm)' }}>{label}</span>
                <span style={{ fontWeight: 500, color: 'var(--tx)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
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

        {/* Transformers table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Transformer / serial numbers</span>
            <span style={{ fontSize: 12, color: 'var(--txm)' }}>{transformers?.length || 0} registered</span>
          </div>
          {!transformers || transformers.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No transformers registered yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Serial number', 'Rating', 'Manufacturer', 'Year', 'Warranty', 'Site'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transformers.map((t) => {
                  const ws = warrantyLabels[t.warranty_status] || { label: t.warranty_status, bg: 'var(--gl)', color: 'var(--txm)' }
                  const site = sites?.find(s => s.id === t.site_id)
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--m)' }}>{t.serial_number}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{t.rating || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{t.manufacturer || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{t.year_of_manufacture || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: ws.bg, color: ws.color }}>{ws.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{site?.site_name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

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
