'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitManagerDecision, submitHeadDecision, type ExpenseLogView } from '@/app/actions/expenses'

const EXPENSE_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  manager_approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Awaiting final approval' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  expenses: ExpenseLogView[]
  canApproveAsManager: boolean
  canApproveAsHead: boolean
}

export default function EngineerExpensesTable({ expenses, canApproveAsManager, canApproveAsHead }: Props) {
  const router = useRouter()
  const [actingId, setActingId] = useState<string | null>(null)

  async function actManager(id: string, decision: 'approve' | 'reject') {
    setActingId(id)
    await submitManagerDecision(id, decision)
    setActingId(null)
    router.refresh()
  }

  async function actHead(id: string, decision: 'approve' | 'reject') {
    setActingId(id)
    await submitHeadDecision(id, decision)
    setActingId(null)
    router.refresh()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Expense requests</div>
      {expenses.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No expense requests yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Project', 'Type', 'Date', 'Amount', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map(e => {
              const cfg = EXPENSE_STATUS_CFG[e.status]
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{e.projectLabel}</div>
                    <div style={{ fontSize: 10, color: 'var(--txm)' }}>{e.woNumber}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{e.expenseTypeName}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)' }}>{formatDate(e.expenseDate)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: e.overLimit ? '#991B1B' : 'var(--tx)' }}>{formatAmount(e.amount)}</div>
                    {e.eligibleLimit != null && <div style={{ fontSize: 9, color: 'var(--txm)' }}>Eligible {formatAmount(e.eligibleLimit)}</div>}
                    {e.overLimit && <span style={{ display: 'inline-block', marginTop: 2, fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>Over limit</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {e.status === 'pending' && canApproveAsManager ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={actingId === e.id} onClick={() => actManager(e.id, 'approve')}
                          style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === e.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>
                          Approve
                        </button>
                        <button disabled={actingId === e.id} onClick={() => actManager(e.id, 'reject')}
                          style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === e.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#FEE2E2', color: '#991B1B', whiteSpace: 'nowrap' }}>
                          Reject
                        </button>
                      </div>
                    ) : e.status === 'manager_approved' && canApproveAsHead ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={actingId === e.id} onClick={() => actHead(e.id, 'approve')}
                          style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === e.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#D1FAE5', color: '#065F46', whiteSpace: 'nowrap' }}>
                          Final approve
                        </button>
                        <button disabled={actingId === e.id} onClick={() => actHead(e.id, 'reject')}
                          style={{ border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: actingId === e.id ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', background: '#FEE2E2', color: '#991B1B', whiteSpace: 'nowrap' }}>
                          Reject
                        </button>
                      </div>
                    ) : e.status === 'manager_approved' ? (
                      <span style={{ fontSize: 10, color: 'var(--txm)' }}>
                        {e.managerApprovedByName ? `Approved by ${e.managerApprovedByName}, ` : ''}awaiting final approval
                      </span>
                    ) : (e.status === 'approved' || e.status === 'rejected') && e.reviewedByName ? (
                      <span style={{ fontSize: 10, color: 'var(--txm)' }}>by {e.reviewedByName}</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
