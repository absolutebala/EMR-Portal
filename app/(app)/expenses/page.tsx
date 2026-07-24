'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { getAllExpenseLogs, updateExpenseLogStatus, type ExpenseLogView } from '@/app/actions/expenses'
import { getMyPermissions } from '@/app/actions/roles-actions'

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

type TabId = 'all' | 'pending' | 'approved' | 'rejected'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ExpensesPage() {
  const [logs, setLogs] = useState<ExpenseLogView[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean> | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('all')
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { logs: data } = await getAllExpenseLogs()
    setLogs(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser(prev => ({ ...prev, name: `${data.first_name} ${data.last_name}`, role: data.role }))
      })
    })
    getMyPermissions().then(({ permissions, role }) => {
      setMyPermissions(permissions)
      if (role) setCurrentUser(prev => ({ ...prev, role }))
    })
  }, [load, supabase])

  function can(key: string) {
    if (myPermissions === null) return false
    if (currentUser.role === 'Super Admin') return true
    const hasPerms = Object.keys(myPermissions).length > 0
    if (!hasPerms) return true
    return myPermissions[key] === true
  }

  async function act(id: string, status: 'approved' | 'rejected') {
    setActingId(id)
    await updateExpenseLogStatus(id, status)
    setActingId(null)
    load()
  }

  const counts: Record<TabId, number> = {
    all: logs.length,
    pending: logs.filter(l => l.status === 'pending').length,
    approved: logs.filter(l => l.status === 'approved').length,
    rejected: logs.filter(l => l.status === 'rejected').length,
  }
  const filtered = tab === 'all' ? logs : logs.filter(l => l.status === tab)
  const filteredTotal = filtered.reduce((sum, l) => sum + l.amount, 0)
  const canApprove = can('Expenses — Approve')

  return (
    <>
      <Topbar title="Expenses" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'pending', 'approved', 'rejected'] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${tab === t ? 'var(--m)' : 'var(--gm)'}`,
                  background: tab === t ? 'var(--m)' : '#fff', color: tab === t ? '#fff' : 'var(--tx)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
                }}
              >
                {t === 'all' ? 'All' : STATUS_CFG[t].label} ({counts[t]})
              </button>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '8px 16px' }}>
            <span style={{ fontSize: 11, color: 'var(--txm)' }}>Total{tab !== 'all' ? ` (${STATUS_CFG[tab]?.label || tab})` : ''}: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{formatAmount(filteredTotal)}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading expenses…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13, background: '#fff', borderRadius: 10, border: '1px solid var(--gm)' }}>
            No expenses{tab !== 'all' ? ` in "${STATUS_CFG[tab].label}"` : ''} yet.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Engineer', 'Project', 'Type', 'Date', 'Amount', 'Receipt', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{log.engineerName || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{log.projectLabel}</div>
                      <div style={{ fontSize: 10, color: 'var(--txm)' }}>{log.woNumber} · {log.customerName}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{log.expenseTypeName}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{formatDate(log.expenseDate)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{formatAmount(log.amount)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.photoUrl} alt="Receipt" onClick={() => setEnlargedPhoto(log.photoUrl)}
                          style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gm)', cursor: 'pointer' }} />
                      ) : <span style={{ fontSize: 11, color: 'var(--txm)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[log.status].bg, color: STATUS_CFG[log.status].color, whiteSpace: 'nowrap' }}>
                        {STATUS_CFG[log.status].label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.status === 'pending' && canApprove ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button disabled={actingId === log.id} onClick={() => act(log.id, 'approved')}
                            style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>
                            Approve
                          </button>
                          <button disabled={actingId === log.id} onClick={() => act(log.id, 'rejected')}
                            style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === log.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#FEE2E2', color: '#991B1B', whiteSpace: 'nowrap' }}>
                            Reject
                          </button>
                        </div>
                      ) : log.status !== 'pending' && log.reviewedByName ? (
                        <span style={{ fontSize: 10, color: 'var(--txm)' }}>by {log.reviewedByName}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!enlargedPhoto} onClose={() => setEnlargedPhoto(null)} title="Receipt photo" size="lg">
        {enlargedPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enlargedPhoto} alt="Receipt" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
        )}
      </Modal>
    </>
  )
}
