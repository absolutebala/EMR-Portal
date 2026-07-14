'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { getFieldEngineersOverview, type FieldEngineerOverview, type EngineerStatus } from '@/app/actions/get-engineers'

const STATUS_CONFIG: Record<EngineerStatus, { label: string; bg: string; color: string }> = {
  available: { label: 'Available', bg: '#D1FAE5', color: '#065F46' },
  on_site: { label: 'On site', bg: '#FEF3C7', color: '#92400E' },
  work_in_progress: { label: 'Work in progress', bg: '#EDE9FE', color: '#5B21B6' },
  off_duty: { label: 'Off duty', bg: '#F1F5F9', color: '#475569' },
}

function StatusBadge({ status }: { status: EngineerStatus }) {
  const c = STATUS_CONFIG[status]
  return <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

export default function EngineersPage() {
  const router = useRouter()
  const [engineers, setEngineers] = useState<FieldEngineerOverview[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { engineers: data } = await getFieldEngineersOverview()
    setEngineers(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
    return () => clearTimeout(t)
  }, [load, supabase])

  const stats = {
    available: engineers.filter(e => e.status === 'available').length,
    onSite: engineers.filter(e => e.status === 'on_site').length,
    wip: engineers.filter(e => e.status === 'work_in_progress').length,
    offDuty: engineers.filter(e => e.status === 'off_duty').length,
  }

  return (
    <>
      <Topbar title="Field Engineers" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', color: 'var(--m)', borderRadius: 10, padding: '9px 14px', marginBottom: 16, fontSize: 11, lineHeight: 1.5 }}>
          Status is derived from real job activity (checked in / form submitted / closed) and recent app activity — not continuous GPS tracking, which a mobile web app can&apos;t reliably do in the background. &ldquo;Current location&rdquo; is each engineer&apos;s last site check-in.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Available', val: stats.available, color: '#059669' },
            { label: 'On site', val: stats.onSite, color: '#D97706' },
            { label: 'Work in progress', val: stats.wip, color: '#7C3AED' },
            { label: 'Off duty', val: stats.offDuty, color: '#64748B' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Field engineers</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, background: '#10B981', borderRadius: '50%' }} />
              <span style={{ fontSize: 11, color: 'var(--txm)' }}>Updated on page load</span>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading engineers…</div>
          ) : engineers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No field engineers found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    {['Engineer', 'Employee ID', 'Status', 'Current location', 'Next assigned site', 'Open WOs', 'Completed today', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engineers.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{e.name}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{e.employee_id}</td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={e.status} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.lastCheckin ? (
                          <>
                            <div>{e.lastCheckin.placeName || 'Location unavailable'}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>{relativeTime(e.lastCheckin.checkedInAt)}</div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>No check-ins yet</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.nextAssigned ? (
                          <>
                            <div>{e.nextAssigned.customerName || e.nextAssigned.woNumber}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>
                              {e.nextAssigned.scheduledDate ? new Date(e.nextAssigned.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)', textAlign: 'center' }}>{e.openWorkOrders}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)', textAlign: 'center' }}>{e.completedToday}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => router.push(`/work-orders?engineer=${e.id}`)}
                          style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--m)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}
                        >
                          View jobs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
