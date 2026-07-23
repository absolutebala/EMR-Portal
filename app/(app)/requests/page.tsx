'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { getAllProductRequests, updateProductRequestItemStatus, type ProductRequestView, type ProductRequestItemView } from '@/app/actions/products'
import { getMyPermissions } from '@/app/actions/roles-actions'

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending approval' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  dispatched: { bg: '#D1FAE5', color: '#065F46', label: 'Dispatched' },
}

type TabId = 'all' | 'pending' | 'approved' | 'dispatched' | 'rejected'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<ProductRequestView[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean> | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('all')
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { requests: data } = await getAllProductRequests()
    setRequests(data)
    setLoading(false)
  }, [])

  useEffect(() => {
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

  async function act(itemId: string, status: 'approved' | 'rejected' | 'dispatched') {
    setActingId(itemId)
    await updateProductRequestItemStatus(itemId, status)
    setActingId(null)
    load()
  }

  const allItems = requests.flatMap(r => r.items.map(i => ({ req: r, item: i })))
  const counts: Record<TabId, number> = {
    all: allItems.length,
    pending: allItems.filter(x => x.item.status === 'pending').length,
    approved: allItems.filter(x => x.item.status === 'approved').length,
    dispatched: allItems.filter(x => x.item.status === 'dispatched').length,
    rejected: allItems.filter(x => x.item.status === 'rejected').length,
  }
  const filteredRequests = tab === 'all' ? requests : requests
    .map(r => ({ ...r, items: r.items.filter(i => i.status === tab) }))
    .filter(r => r.items.length > 0)

  return (
    <>
      <Topbar title="Product Requests" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['all', 'pending', 'approved', 'dispatched', 'rejected'] as TabId[]).map(t => (
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

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading requests…</div>
        ) : filteredRequests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13, background: '#fff', borderRadius: 10, border: '1px solid var(--gm)' }}>
            No product requests{tab !== 'all' ? ` in "${STATUS_CFG[tab].label}"` : ''} yet.
          </div>
        ) : (
          filteredRequests.map(req => (
            <div key={req.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{req.woNumber}</div>
                  <div style={{ fontSize: 11, color: 'var(--txm)' }}>
                    Requested by {req.engineerName || 'Engineer'} · {formatDate(req.createdAt)}
                  </div>
                </div>
                {req.damagePhotoUrls.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {req.damagePhotoUrls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="Damaged product" onClick={() => setEnlargedPhoto(url)}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--gm)', cursor: 'pointer' }} />
                    ))}
                  </div>
                )}
              </div>

              {req.items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid var(--gl)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{item.productName} × {item.quantity}</div>
                    <div style={{ fontSize: 10, color: 'var(--txm)' }}>
                      {item.sapCode ? `SAP: ${item.sapCode}` : 'No SAP code'}
                      {item.approverName && item.status !== 'pending' && ` · by ${item.approverName}`}
                      {item.deliveryEstimate && ` · Est. delivery ${formatDate(item.deliveryEstimate)}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: STATUS_CFG[item.status].bg, color: STATUS_CFG[item.status].color, whiteSpace: 'nowrap' }}>
                    {STATUS_CFG[item.status].label}
                  </span>
                  <ItemActions item={item} canApprove={can('Product Requests — Approve')} canDispatch={can('Product Requests — Dispatch')} acting={actingId === item.id} onAct={status => act(item.id, status)} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <Modal open={!!enlargedPhoto} onClose={() => setEnlargedPhoto(null)} title="Damaged product photo" size="lg">
        {enlargedPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enlargedPhoto} alt="Damaged product" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
        )}
      </Modal>
    </>
  )
}

function ItemActions({ item, canApprove, canDispatch, acting, onAct }: {
  item: ProductRequestItemView
  canApprove: boolean
  canDispatch: boolean
  acting: boolean
  onAct: (status: 'approved' | 'rejected' | 'dispatched') => void
}) {
  const btnStyle: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }

  if (item.status === 'pending' && canApprove) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={acting} onClick={() => onAct('approved')} style={{ ...btnStyle, background: '#D1FAE5', color: '#065F46' }}>Approve</button>
        <button disabled={acting} onClick={() => onAct('rejected')} style={{ ...btnStyle, background: '#FEE2E2', color: '#991B1B' }}>Reject</button>
      </div>
    )
  }
  if (item.status === 'approved' && canDispatch) {
    return <button disabled={acting} onClick={() => onAct('dispatched')} style={{ ...btnStyle, background: 'var(--gl)', color: 'var(--m)' }}>Mark dispatched</button>
  }
  return null
}
