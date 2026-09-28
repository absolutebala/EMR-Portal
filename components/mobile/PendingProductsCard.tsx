'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markProductReceived } from '@/app/actions/mobile-actions'
import type { PendingProductItem } from '@/lib/mobile/core/products'

// PWA counterpart of the native app's PendingProductsCard. Stays on the dashboard from
// approval until the item is delivered; 'dispatched' items get a self-serve "Mark
// Received" button (the one status change a field engineer can make), 'approved' ones
// are informational.
export default function PendingProductsCard({ items }: { items: PendingProductItem[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [received, setReceived] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const visible = items.filter(i => !received.has(i.id))
  if (visible.length === 0) return null

  async function receive(id: string) {
    setBusyId(id)
    setError('')
    const { error } = await markProductReceived(id)
    setBusyId(null)
    if (error) { setError(error); return }
    setReceived(prev => new Set(prev).add(id))
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#7A6870', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
        Product Requests
      </p>
      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #EFE7EA' }}>
            <button
              className="mtap"
              onClick={() => router.push(`/mobile/work-orders/${item.workOrderId}`)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1C0D14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.productName} × {item.quantity}</div>
              <div style={{ fontSize: 10.5, color: '#7A6870', marginTop: 2 }}>{item.woNumber}</div>
            </button>
            {item.status === 'dispatched' ? (
              <button
                className="mtap"
                onClick={() => receive(item.id)}
                disabled={busyId === item.id}
                style={{ flexShrink: 0, background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600, cursor: busyId === item.id ? 'not-allowed' : 'pointer', opacity: busyId === item.id ? 0.7 : 1, fontFamily: 'Poppins, sans-serif' }}
              >
                {busyId === item.id ? 'Saving…' : 'Mark Received'}
              </button>
            ) : (
              <span style={{ flexShrink: 0, background: '#DBEAFE', color: '#1E40AF', borderRadius: 999, padding: '5px 10px', fontSize: 10.5, fontWeight: 600 }}>Approved</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
