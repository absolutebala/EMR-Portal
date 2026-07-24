'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import type { ExpenseLogView } from '@/app/actions/expenses'

interface Props {
  logs: ExpenseLogView[]
  error: string | null
}

interface ProjectGroup {
  workOrderId: string
  woNumber: string
  projectLabel: string
  customerName: string
  total: number
  count: number
  pendingCount: number
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ExpensesListClient({ logs, error }: Props) {
  const router = useRouter()

  const projects = useMemo(() => {
    const map: Record<string, ProjectGroup> = {}
    for (const log of logs) {
      if (!map[log.workOrderId]) {
        map[log.workOrderId] = {
          workOrderId: log.workOrderId, woNumber: log.woNumber, projectLabel: log.projectLabel,
          customerName: log.customerName, total: 0, count: 0, pendingCount: 0,
        }
      }
      map[log.workOrderId].total += log.amount
      map[log.workOrderId].count += 1
      if (log.status === 'pending') map[log.workOrderId].pendingCount += 1
    }
    return Object.values(map).sort((a, b) => a.projectLabel.localeCompare(b.projectLabel))
  }, [logs])

  const grandTotal = logs.reduce((sum, l) => sum + l.amount, 0)

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Expenses" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          className="mtap"
          onClick={() => router.push('/mobile/expenses/new')}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add expense
        </button>

        {logs.length > 0 && (
          <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 11, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#7D1D3F' }}>Total logged</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#7D1D3F' }}>{formatAmount(grandTotal)}</span>
          </div>
        )}

        {projects.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No expenses logged yet.</div>
          </div>
        )}

        {projects.map(p => (
          <div
            key={p.workOrderId}
            className="mtap"
            onClick={() => router.push(`/mobile/expenses/${p.workOrderId}`)}
            style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{p.projectLabel}</div>
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>{p.woNumber} · {p.customerName}</div>
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 4 }}>
                  {p.count} log{p.count !== 1 ? 's' : ''}
                  {p.pendingCount > 0 && (
                    <span style={{ marginLeft: 6, color: '#92400E', fontWeight: 600 }}>· {p.pendingCount} pending</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#7D1D3F', flexShrink: 0 }}>{formatAmount(p.total)}</div>
            </div>
          </div>
        ))}
      </div>

      <BottomNav active="expenses" />
    </div>
  )
}
