'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import { compressImage } from '@/lib/mobile/compressImage'
import { searchProducts, submitProductRequest, type Product } from '@/app/actions/products'
import type { MobileWorkOrder } from '@/app/actions/mobile-actions'

interface Props {
  workOrders: MobileWorkOrder[]
  error: string | null
}

interface CartItem { product: Product; quantity: number }
interface DamagePhoto { dataUrl: string; mimeType: string; ext: string }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif',
  background: '#fff', boxSizing: 'border-box',
}

export default function NewRequestClient({ workOrders, error }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedWoId, setSelectedWoId] = useState(searchParams.get('wo') || '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState<Record<string, CartItem>>({})
  const [damagePhotos, setDamagePhotos] = useState<DamagePhoto[]>([])
  const [compressing, setCompressing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const { products } = await searchProducts(q)
      setResults(products)
      setSearching(false)
    }, 300)
  }, [])

  useEffect(() => () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }, [])

  function addToCart(product: Product) {
    if (product.stock_qty === 0) return
    setCart(prev => ({ ...prev, [product.id]: { product, quantity: (prev[product.id]?.quantity || 0) + 1 } }))
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev => {
      const existing = prev[productId]
      if (!existing) return prev
      const nextQty = existing.quantity + delta
      if (nextQty <= 0) {
        const rest = { ...prev }
        delete rest[productId]
        return rest
      }
      return { ...prev, [productId]: { ...existing, quantity: nextQty } }
    })
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const dataUrl = await compressImage(file)
      setDamagePhotos(prev => [...prev, { dataUrl, mimeType: 'image/jpeg', ext: 'jpg' }])
    } catch {
      setSubmitError('Could not process that photo — please try again')
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removePhoto(index: number) {
    setDamagePhotos(prev => prev.filter((_, i) => i !== index))
  }

  const cartItems = Object.values(cart)

  async function handleSubmit() {
    setSubmitError('')
    if (!selectedWoId) { setSubmitError('Select the linked notification'); return }
    if (cartItems.length === 0) { setSubmitError('Add at least one product'); return }
    if (damagePhotos.length === 0) { setSubmitError('At least one damaged-product photo is required'); return }

    setSubmitting(true)
    const result = await submitProductRequest({
      workOrderId: selectedWoId,
      items: cartItems.map(c => ({ productId: c.product.id, quantity: c.quantity })),
      damagePhotos: damagePhotos.map(p => ({ base64: p.dataUrl, mimeType: p.mimeType, ext: p.ext })),
    })
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
        <MobileHeader title="Request Submitted" backHref="/mobile/requests" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg width="26" height="26" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1C0D14', marginBottom: 4 }}>Request submitted</p>
          <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 20 }}>Your supervisor will review it shortly.</p>
          <button
            className="mtap"
            onClick={() => router.push('/mobile/requests')}
            style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            View my requests
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="New Request" backHref="/mobile/requests" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 100 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }}>
            Linked notification <span style={{ color: '#7D1D3F' }}>*</span>
          </label>
          <select value={selectedWoId} onChange={e => setSelectedWoId(e.target.value)} style={inputStyle}>
            <option value="">Select a notification…</option>
            {workOrders.map(wo => (
              <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.customer_name}</option>
            ))}
          </select>
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Products</p>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search by product name or SAP code…"
              style={inputStyle}
            />
            {searching && <div style={{ position: 'absolute', right: 10, top: 11, fontSize: 10, color: '#7A6870' }}>Searching…</div>}
          </div>
          {results.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F5F3F5' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#1C0D14' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#7A6870' }}>
                  {p.sap_code ? `SAP: ${p.sap_code} · ` : ''}
                  <span style={{ color: p.stock_qty === 0 ? '#DC2626' : p.stock_qty <= 3 ? '#D97706' : '#059669', fontWeight: 500 }}>
                    {p.stock_qty === 0 ? 'Out of stock' : `In stock: ${p.stock_qty}`}
                  </span>
                </div>
              </div>
              <button
                className="mtap"
                onClick={() => addToCart(p)}
                disabled={p.stock_qty === 0}
                style={{
                  border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
                  background: p.stock_qty === 0 ? '#E5E0E3' : '#7D1D3F', color: p.stock_qty === 0 ? '#7A6870' : '#fff',
                  cursor: p.stock_qty === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Add
              </button>
            </div>
          ))}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p style={{ fontSize: 11, color: '#7A6870', marginTop: 4 }}>No products found for &quot;{query}&quot;</p>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 8 }}>Damaged product photos <span style={{ color: '#7D1D3F' }}>*</span></p>
          <p style={{ fontSize: 11, color: '#7A6870', marginBottom: 8 }}>Upload photos of the damaged products requiring replacement.</p>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {damagePhotos.map((p, i) => (
              <div key={i} style={{ position: 'relative', width: 60, height: 60 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="Damaged product" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E0E3' }} />
                <button
                  className="mtap"
                  onClick={() => removePhoto(i)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#DC2626', border: '2px solid #fff', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ×
                </button>
              </div>
            ))}
            <div
              className="mtap"
              onClick={() => !compressing && fileInputRef.current?.click()}
              style={{ width: 60, height: 60, borderRadius: 8, border: '1.5px dashed #E8C5D0', background: '#F9EEF2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: compressing ? 'default' : 'pointer' }}
            >
              {compressing ? (
                <span style={{ fontSize: 9, color: '#7D1D3F' }}>…</span>
              ) : (
                <svg width="18" height="18" fill="none" stroke="#7D1D3F" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 11, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7D1D3F', margin: 0 }}>Request cart</p>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#7D1D3F' }}>{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</span>
          </div>
          {cartItems.length === 0 ? (
            <p style={{ fontSize: 11, color: '#7A6870' }}>No products added yet.</p>
          ) : (
            cartItems.map(c => (
              <div key={c.product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0' }}>
                <span style={{ fontSize: 12, color: '#1C0D14' }}>{c.product.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="mtap" onClick={() => changeQty(c.product.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E5E0E3', background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>−</button>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 14, textAlign: 'center' }}>{c.quantity}</span>
                  <button className="mtap" onClick={() => changeQty(c.product.id, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E5E0E3', background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>+</button>
                </div>
              </div>
            ))
          )}
        </div>

        {submitError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginTop: 12 }}>{submitError}</div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E5E0E3', padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          className="mtap"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: submitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </div>
  )
}
