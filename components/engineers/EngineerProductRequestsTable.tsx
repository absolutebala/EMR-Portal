'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateProductRequestItemStatus, type ProductRequestView, type ProductRequestItemView } from '@/app/actions/products'

const REQUEST_ITEM_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  dispatched: { bg: '#E0E7FF', color: '#3730A3', label: 'Dispatched' },
  delivered: { bg: '#D1FAE5', color: '#065F46', label: 'Delivered' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  requests: ProductRequestView[]
  canApprove: boolean
  canDispatch: boolean
  canDeliver: boolean
}

function ItemActions({ item, canApprove, canDispatch, canDeliver, acting, onAct }: {
  item: ProductRequestItemView
  canApprove: boolean
  canDispatch: boolean
  canDeliver: boolean
  acting: boolean
  onAct: (status: 'approved' | 'rejected' | 'dispatched' | 'delivered') => void
}) {
  const btnStyle: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 10, fontWeight: 500, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }

  if (item.status === 'pending' && canApprove) {
    return (
      <div style={{ display: 'flex', gap: 5 }}>
        <button disabled={acting} onClick={() => onAct('approved')} style={{ ...btnStyle, background: '#D1FAE5', color: '#065F46' }}>Approve</button>
        <button disabled={acting} onClick={() => onAct('rejected')} style={{ ...btnStyle, background: '#FEE2E2', color: '#991B1B' }}>Reject</button>
      </div>
    )
  }
  if (item.status === 'approved' && canDispatch) {
    return <button disabled={acting} onClick={() => onAct('dispatched')} style={{ ...btnStyle, background: '#E0E7FF', color: '#3730A3' }}>Mark dispatched</button>
  }
  if (item.status === 'dispatched' && canDeliver) {
    return <button disabled={acting} onClick={() => onAct('delivered')} style={{ ...btnStyle, background: '#D1FAE5', color: '#065F46' }}>Mark delivered</button>
  }
  return null
}

export default function EngineerProductRequestsTable({ requests, canApprove, canDispatch, canDeliver }: Props) {
  const router = useRouter()
  const [actingId, setActingId] = useState<string | null>(null)

  async function act(itemId: string, status: 'approved' | 'rejected' | 'dispatched' | 'delivered') {
    setActingId(itemId)
    await updateProductRequestItemStatus(itemId, status)
    setActingId(null)
    router.refresh()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gm)', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Product requests</div>
      {requests.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No product requests yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Notification', 'Date', 'Items', 'Actions'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                  <Link href={`/work-orders/${r.workOrderId}`} style={{ fontSize: 12, fontWeight: 500, color: 'var(--m)', textDecoration: 'none' }}>{r.woNumber}</Link>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txm)', verticalAlign: 'top' }}>{formatDate(r.createdAt)}</td>
                <td style={{ padding: '10px 14px' }}>
                  {r.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--tx)' }}>{item.productName} × {item.quantity}</span>
                      <span style={{
                        fontSize: 9, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
                        background: REQUEST_ITEM_STATUS_CFG[item.status].bg, color: REQUEST_ITEM_STATUS_CFG[item.status].color,
                      }}>
                        {REQUEST_ITEM_STATUS_CFG[item.status].label}
                      </span>
                    </div>
                  ))}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {r.items.map(item => (
                    <div key={item.id} style={{ marginBottom: 6, minHeight: 22, display: 'flex', alignItems: 'center' }}>
                      <ItemActions item={item} canApprove={canApprove} canDispatch={canDispatch} canDeliver={canDeliver} acting={actingId === item.id} onAct={status => act(item.id, status)} />
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
