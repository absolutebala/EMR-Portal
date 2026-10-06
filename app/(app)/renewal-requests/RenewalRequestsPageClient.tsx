'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { submitRenewalManagerDecision, submitRenewalHeadDecision } from '@/app/actions/renewal-requests'
import type { RenewalRequest, RenewalRequestStatus } from '@/lib/types'

const STATUS_CFG: Record<RenewalRequestStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Awaiting Service Manager', bg: '#FEF3C7', color: '#92400E' },
  manager_approved: { label: 'Awaiting Head of Service', bg: '#DBEAFE', color: '#1D4ED8' },
  approved: { label: 'Approved', bg: '#D1FAE5', color: '#065F46' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', color: '#991B1B' },
}

type TabId = 'pending' | 'manager_approved' | 'approved' | 'rejected'
const TABS: { id: TabId; label: string }[] = [
  { id: 'pending', label: 'Awaiting first approval' },
  { id: 'manager_approved', label: 'Awaiting final approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

interface Props {
  items: RenewalRequest[]
  userName: string
  userRole: string
  canApproveAsManager: boolean
  canApproveAsHead: boolean
}

export default function RenewalRequestsPageClient({ items, userName, userRole, canApproveAsManager, canApproveAsHead }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filtered = useMemo(() => items.filter(r => r.status === tab), [items, tab])
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    items.forEach(r => { c[r.status] = (c[r.status] || 0) + 1 })
    return c
  }, [items])

  async function act(id: string, stage: 'manager' | 'head', decision: 'approve' | 'reject') {
    setBusy(id); setError('')
    const fn = stage === 'manager' ? submitRenewalManagerDecision : submitRenewalHeadDecision
    const { error } = await fn(id, decision)
    setBusy(null)
    if (error) { setError(error); return }
    router.refresh()
  }

  const th: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, color: 'var(--tx)', borderBottom: '1px solid var(--gm)', verticalAlign: 'top' }

  return (
    <>
      <Topbar title="Renewal Requests" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '8px 14px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }}
              style={{ padding: '7px 14px', borderRadius: 20, border: '1px solid var(--gm)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif',
                background: tab === t.id ? 'var(--m)' : '#fff', color: tab === t.id ? '#fff' : 'var(--tx)' }}>
              {t.label}{counts[t.id] ? ` (${counts[t.id]})` : ''}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No requests here.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Serial number', 'Customer', 'Type', 'Years', 'Expiry (prev → new)', 'Requested by', 'Comments', 'Status', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(r => {
                    const cfg = STATUS_CFG[r.status]
                    const canManager = r.status === 'pending' && canApproveAsManager
                    const canHead = r.status === 'manager_approved' && canApproveAsHead
                    return (
                      <tr key={r.id}>
                        <td style={{ ...td, fontWeight: 500, color: 'var(--m)' }}>{r.serialNumber}</td>
                        <td style={td}>{r.customerName || '—'}</td>
                        <td style={td}>{r.requestType === 'renew' ? 'Renew' : 'Extend'}</td>
                        <td style={td}>{r.years}</td>
                        <td style={td}>{fmtDate(r.previousExpiryDate)} → <strong>{fmtDate(r.newExpiryDate)}</strong></td>
                        <td style={td}>{r.requestedByName}</td>
                        <td style={{ ...td, maxWidth: 220, whiteSpace: 'normal' }}>{r.comments || '—'}</td>
                        <td style={td}><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {(canManager || canHead) ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => act(r.id, canHead ? 'head' : 'manager', 'approve')} disabled={busy === r.id}
                                style={{ padding: '5px 11px', borderRadius: 6, border: 'none', background: '#065F46', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: busy === r.id ? .6 : 1 }}>
                                {busy === r.id ? '…' : (canHead ? 'Final approve' : 'Approve')}
                              </button>
                              <button onClick={() => act(r.id, canHead ? 'head' : 'manager', 'reject')} disabled={busy === r.id}
                                style={{ padding: '5px 11px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: busy === r.id ? .6 : 1 }}>
                                Reject
                              </button>
                            </div>
                          ) : r.status === 'pending' ? (
                            <span style={{ fontSize: 11, color: 'var(--txm)' }}>Awaiting Service Manager</span>
                          ) : r.status === 'manager_approved' ? (
                            <span style={{ fontSize: 11, color: 'var(--txm)' }}>Awaiting Head of Service</span>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && <Pagination page={page} totalPages={totalPages} onPage={setPage} total={total} pageSize={pageSize} />}
        </div>
      </div>
    </>
  )
}
