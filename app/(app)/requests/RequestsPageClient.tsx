'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { updateProductRequestItemStatus } from '@/app/actions/products'
import type { ProductRequestView, ProductRequestItemView } from '@/lib/mobile/core/products'

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending approval' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  dispatched: { bg: '#E0E7FF', color: '#3730A3', label: 'Dispatched' },
  delivered: { bg: '#D1FAE5', color: '#065F46', label: 'Delivered' },
}

type TabId = 'all' | 'pending' | 'approved' | 'dispatched' | 'delivered' | 'rejected'
const TAB_IDS: TabId[] = ['all', 'pending', 'approved', 'dispatched', 'delivered', 'rejected']

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  requests: ProductRequestView[]
  userName: string
  userRole: string
  canApprove: boolean
  canDispatch: boolean
  canDeliver: boolean
}

export default function RequestsPageClient({ requests, userName, userRole, canApprove, canDispatch, canDeliver }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Lets the dashboard's Product Requests breakdown card deep-link straight into a
  // tab (e.g. /requests?tab=dispatched) instead of always landing on "All".
  const tabParam = searchParams.get('tab')
  const initialTab: TabId = TAB_IDS.includes(tabParam as TabId) ? (tabParam as TabId) : 'all'
  const [tab, setTab] = useState<TabId>(initialTab)
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [acting, setActing] = useState<{ id: string; status: string } | null>(null)

  async function act(itemId: string, status: 'approved' | 'rejected' | 'delivered') {
    setActing({ id: itemId, status })
    await updateProductRequestItemStatus(itemId, status)
    setActing(null)
    router.refresh()
  }

  // Dispatch goes through a modal that first collects the docket (PDF/image) + an
  // optional docket/tracking number, then marks the item dispatched.
  const [dispatchItemId, setDispatchItemId] = useState<string | null>(null)
  const [docket, setDocket] = useState<{ base64: string; mimeType: string; ext: string; name: string } | null>(null)
  const [docketNumber, setDocketNumber] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchError, setDispatchError] = useState('')

  function openDispatch(itemId: string) {
    setDispatchItemId(itemId); setDocket(null); setDocketNumber(''); setDispatchError('')
  }
  function onDocketFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!(file.type === 'application/pdf' || file.type.startsWith('image/'))) { setDispatchError('Upload a PDF or an image.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const ext = file.name.includes('.') ? file.name.split('.').pop()! : (file.type === 'application/pdf' ? 'pdf' : 'jpg')
      setDocket({ base64: reader.result as string, mimeType: file.type, ext, name: file.name })
      setDispatchError('')
    }
    reader.readAsDataURL(file)
  }
  async function submitDispatch() {
    if (!dispatchItemId || !docket) { setDispatchError('Upload the docket (PDF or image) first.'); return }
    setDispatching(true)
    const { error } = await updateProductRequestItemStatus(dispatchItemId, 'dispatched', {
      docket: { base64: docket.base64, mimeType: docket.mimeType, ext: docket.ext },
      docketNumber: docketNumber.trim() || null,
    })
    setDispatching(false)
    if (error) { setDispatchError(error); return }
    setDispatchItemId(null)
    router.refresh()
  }

  const allItems = requests.flatMap(r => r.items.map(i => ({ req: r, item: i })))
  const counts: Record<TabId, number> = {
    all: allItems.length,
    pending: allItems.filter(x => x.item.status === 'pending').length,
    approved: allItems.filter(x => x.item.status === 'approved').length,
    dispatched: allItems.filter(x => x.item.status === 'dispatched').length,
    delivered: allItems.filter(x => x.item.status === 'delivered').length,
    rejected: allItems.filter(x => x.item.status === 'rejected').length,
  }
  const filteredRequests = tab === 'all' ? requests : requests
    .map(r => ({ ...r, items: r.items.filter(i => i.status === tab) }))
    .filter(r => r.items.length > 0)

  return (
    <>
      <Topbar title="Product Requests" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {TAB_IDS.map(t => (
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

        {filteredRequests.length === 0 ? (
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
                  {(req.docketUrl || req.docketNumber) && (
                    <div style={{ fontSize: 11, color: 'var(--m)', marginTop: 3, fontWeight: 600 }}>
                      📄 Docket{req.docketNumber ? ` ${req.docketNumber}` : ''}
                      {req.docketUrl && <> · <a href={req.docketUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--m)', textDecoration: 'underline' }}>View</a></>}
                    </div>
                  )}
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
                  <ItemActions item={item} canApprove={canApprove} canDispatch={canDispatch} canDeliver={canDeliver} actingStatus={acting?.id === item.id ? acting.status : null} onAct={status => act(item.id, status)} onDispatch={() => openDispatch(item.id)} />
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

      <Modal open={!!dispatchItemId} onClose={() => !dispatching && setDispatchItemId(null)} title="Dispatch — upload docket" size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 4 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Docket (PDF or image) <span style={{ color: '#DC2626' }}>*</span></label>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '9px 14px', borderRadius: 8, border: '1.5px solid var(--brand, #7D1D3F)',
              background: docket ? '#F0FDF4' : 'transparent', color: docket ? '#065F46' : 'var(--brand, #7D1D3F)',
              fontSize: 13, fontWeight: 600, fontFamily: 'Poppins,sans-serif',
            }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {docket ? 'Change file' : 'Upload Docket'}
              <input type="file" accept="application/pdf,image/*" onChange={onDocketFile} style={{ display: 'none' }} />
            </label>
            {docket && <div style={{ fontSize: 11, color: '#065F46', marginTop: 6 }}>Selected: {docket.name}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Docket / tracking number <span style={{ color: 'var(--txm)', fontWeight: 400 }}>(optional)</span></label>
            <input value={docketNumber} onChange={e => setDocketNumber(e.target.value)} placeholder="e.g. BLR-2026-00123"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 13, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }} />
          </div>
          {dispatchError && <div style={{ fontSize: 12, color: '#DC2626' }}>{dispatchError}</div>}
          <div style={{ fontSize: 11, color: 'var(--txm)' }}>The customer gets a WhatsApp that the material is dispatched, and the engineer is notified with the docket.</div>
          <button onClick={submitDispatch} disabled={dispatching || !docket}
            style={{ padding: '11px', borderRadius: 8, border: 'none', background: (dispatching || !docket) ? '#C9AEB8' : 'var(--m)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (dispatching || !docket) ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif' }}>
            {dispatching ? 'Dispatching…' : 'Confirm dispatch'}
          </button>
        </div>
      </Modal>
    </>
  )
}

function ItemActions({ item, canApprove, canDispatch, canDeliver, actingStatus, onAct, onDispatch }: {
  item: ProductRequestItemView
  canApprove: boolean
  canDispatch: boolean
  canDeliver: boolean
  actingStatus: string | null
  onAct: (status: 'approved' | 'rejected' | 'delivered') => void
  onDispatch: () => void
}) {
  const isActing = actingStatus !== null
  const btnStyle: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: isActing ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap', opacity: isActing ? 0.6 : 1, transition: 'opacity .1s' }

  if (item.status === 'pending' && canApprove) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={isActing} onClick={() => onAct('approved')} style={{ ...btnStyle, background: '#D1FAE5', color: '#065F46' }}>{actingStatus === 'approved' ? 'Approving…' : 'Approve'}</button>
        <button disabled={isActing} onClick={() => onAct('rejected')} style={{ ...btnStyle, background: '#FEE2E2', color: '#991B1B' }}>{actingStatus === 'rejected' ? 'Rejecting…' : 'Reject'}</button>
      </div>
    )
  }
  if (item.status === 'approved' && canDispatch) {
    return <button disabled={isActing} onClick={onDispatch} style={{ ...btnStyle, background: '#E0E7FF', color: '#3730A3' }}>Mark dispatched</button>
  }
  if (item.status === 'dispatched' && canDeliver) {
    return <button disabled={isActing} onClick={() => onAct('delivered')} style={{ ...btnStyle, background: '#D1FAE5', color: '#065F46' }}>{actingStatus === 'delivered' ? 'Marking delivered…' : 'Mark delivered'}</button>
  }
  return null
}
