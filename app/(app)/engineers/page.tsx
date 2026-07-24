'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { getFieldEngineersOverview, type FieldEngineerOverview, type EngineerStatus } from '@/app/actions/get-engineers'

const STATUS_CONFIG: Record<EngineerStatus, { label: string; bg: string; color: string }> = {
  available: { label: 'Available', bg: '#D1FAE5', color: '#065F46' },
  on_leave: { label: 'On Leave', bg: '#F1F5F9', color: '#475569' },
  on_the_way: { label: 'On the way', bg: '#DBEAFE', color: '#1D4ED8' },
  travelling: { label: 'Travelling', bg: '#EDE9FE', color: '#5B21B6' },
  reached: { label: 'Reached project', bg: '#FEF3C7', color: '#92400E' },
  completed: { label: 'Completed', bg: '#D1FAE5', color: '#065F46' },
}

function StatusBadge({ status, statusSiteName }: { status: EngineerStatus; statusSiteName: string | null }) {
  const c = STATUS_CONFIG[status]
  const showsSite = status === 'on_the_way' || status === 'travelling' || status === 'reached' || status === 'completed'
  const label = showsSite && statusSiteName ? `${c.label} — ${statusSiteName}` : c.label
  return <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{label}</span>
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

  return (
    <>
      <Topbar title="Field Engineers" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

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
                    {['Engineer', 'Employee ID', 'Status', 'Last Seen', 'Next assigned project', 'Open', 'Completed', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engineers.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{e.name}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{e.employee_id}</td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={e.status} statusSiteName={e.statusSiteName} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.lastSeen ? (
                          <>
                            <div>{e.lastSeen.placeName || 'Location unavailable'}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>{formatDateTime(e.lastSeen.at)}</div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>No location yet</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)' }}>
                        {e.nextAssigned ? (
                          <>
                            <div>{e.nextAssigned.customerName || e.nextAssigned.woNumber}</div>
                            <div style={{ color: 'var(--txm)', fontSize: 10 }}>
                              {e.nextAssigned.scheduledDate ? new Date(e.nextAssigned.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                            </div>
                          </>
                        ) : <span style={{ color: 'var(--txm)' }}>No project assigned</span>}
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
