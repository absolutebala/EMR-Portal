'use client'

import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import type { ExpenseLogView } from '@/app/actions/expenses'

interface Props {
  workOrderId: string
  logs: ExpenseLogView[]
  error: string | null
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

function formatAmount(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ExpenseProjectDetailClient({ workOrderId, logs, error }: Props) {
  const router = useRouter()
  const total = logs.reduce((sum, l) => sum + l.amount, 0)
  const first = logs[0]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title={first?.projectLabel || 'Project expenses'} subtitle={first ? `${first.woNumber} · ${first.customerName}` : undefined} backHref="/mobile/expenses" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 100 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 11, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#7D1D3F' }}>{logs.length} log{logs.length !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#7D1D3F' }}>{formatAmount(total)}</span>
        </div>

        {logs.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No expense logs for this project.</div>
          </div>
        )}

        {logs.map(log => (
          <div key={log.id} style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{log.expenseTypeName}</div>
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>{formatDate(log.expenseDate)}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1C0D14', flexShrink: 0 }}>{formatAmount(log.amount)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[log.status].bg, color: STATUS_CFG[log.status].color }}>
                {STATUS_CFG[log.status].label}
              </span>
              {log.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={log.photoUrl} alt="Receipt" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E0E3' }} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E5E0E3', padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          className="mtap"
          onClick={() => router.push(`/mobile/expenses/new?wo=${workOrderId}`)}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Add another expense
        </button>
      </div>
    </div>
  )
}
