'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import type { ProductRequestView } from '@/app/actions/products'

interface Props {
  requests: ProductRequestView[]
  error: string | null
}

type TabId = 'all' | 'pending' | 'approved' | 'dispatched' | 'rejected'

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending approval' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  dispatched: { bg: '#D1FAE5', color: '#065F46', label: 'Dispatched' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function RequestsListClient({ requests, error }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('all')

  const allItems = useMemo(() => requests.flatMap(r => r.items.map(i => ({ req: r, item: i }))), [requests])
  const counts: Record<TabId, number> = {
    all: allItems.length,
    pending: allItems.filter(x => x.item.status === 'pending').length,
    approved: allItems.filter(x => x.item.status === 'approved').length,
    dispatched: allItems.filter(x => x.item.status === 'dispatched').length,
    rejected: allItems.filter(x => x.item.status === 'rejected').length,
  }
  const filtered = tab === 'all' ? requests : requests
    .map(r => ({ ...r, items: r.items.filter(i => i.status === tab) }))
    .filter(r => r.items.length > 0)

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Product Requests" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          className="mtap"
          onClick={() => router.push('/mobile/requests/new')}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New request
        </button>

        <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 3, marginBottom: 14, overflowX: 'auto' }}>
          {(['all', 'pending', 'approved', 'dispatched', 'rejected'] as TabId[]).map(t => (
            <button
              key={t}
              className="mtap"
              onClick={() => setTab(t)}
              style={{
                flexShrink: 0, padding: '6px 11px', borderRadius: 7, fontSize: 11, fontWeight: 500,
                cursor: 'pointer', whiteSpace: 'nowrap', border: 'none', fontFamily: 'Poppins, sans-serif',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#7D1D3F' : '#7A6870',
                boxShadow: tab === t ? '0 1px 3px rgba(125,29,63,0.1)' : 'none',
              }}
            >
              {(t === 'all' ? 'All' : STATUS_CFG[t].label)} ({counts[t]})
            </button>
          ))}
        </div>

        {filtered.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No requests{tab !== 'all' ? ` in "${STATUS_CFG[tab].label}"` : ' yet'}.</div>
          </div>
        )}

        {filtered.map(req => (
          <div key={req.id} style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 2 }}>{req.woNumber}</div>
            <div style={{ fontSize: 10, color: '#7A6870', marginBottom: 8 }}>{formatDate(req.createdAt)}</div>
            {req.items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0' }}>
                <span style={{ fontSize: 12, color: '#1C0D14' }}>{item.productName} × {item.quantity}</span>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[item.status].bg, color: STATUS_CFG[item.status].color, whiteSpace: 'nowrap' }}>
                  {STATUS_CFG[item.status].label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <BottomNav active="requests" />
    </div>
  )
}
