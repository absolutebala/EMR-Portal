'use client'

import { useEffect, useState } from 'react'
import { PUNCH_CATEGORIES, type PunchCategory } from '@/lib/punchCategory'

export interface PunchInPayload {
  category: PunchCategory
  visitCustomerName: string | null
  visitSiteAddress: string | null
  visitPurpose: string | null
}

// Punch-in flow (PWA): pick a work category, then (for the four non-HQ categories) fill
// the mandatory visit details before continuing to the actual GPS check-in the parent runs.
export default function PunchInModal({ open, onCancel, onConfirm, submitting, error }: {
  open: boolean
  onCancel: () => void
  onConfirm: (p: PunchInPayload) => void
  submitting: boolean
  error: string
}) {
  const [category, setCategory] = useState<PunchCategory | null>(null)
  const [customer, setCustomer] = useState('')
  const [site, setSite] = useState('')
  const [purpose, setPurpose] = useState('')

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) { setCategory(null); setCustomer(''); setSite(''); setPurpose('') } }, [open])

  if (!open) return null

  function pick(id: PunchCategory) {
    if (id === 'hq') { onConfirm({ category: 'hq', visitCustomerName: null, visitSiteAddress: null, visitPurpose: null }); return }
    setCategory(id)
  }

  const detailsValid = !!customer.trim() && !!site.trim() && !!purpose.trim()
  const meta = PUNCH_CATEGORIES.find(c => c.id === category)
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 13, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', margin: '10px 0 5px' }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '16px 18px 24px', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: '#E5E0E3', margin: '0 auto 14px' }} />
        {!category ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1C0D14' }}>What are you doing today?</div>
            <div style={{ fontSize: 12, color: '#7A6870', margin: '3px 0 14px' }}>Choose one to continue punching in.</div>
            {PUNCH_CATEGORIES.map(c => (
              <button key={c.id} className="mtap" onClick={() => pick(c.id)} disabled={submitting}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: '1.5px solid #EFE7EA', borderRadius: 13, padding: 12, marginBottom: 10, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'Poppins, sans-serif' }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: c.bg, color: c.tx, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.tag}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1C0D14' }}>{c.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#7A6870' }}>{c.desc}</span>
                </span>
                <span style={{ color: '#B9AEB3', fontSize: 20 }}>›</span>
              </button>
            ))}
            {!!error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="mtap" onClick={onCancel} disabled={submitting} style={{ width: '100%', padding: 12, background: 'none', border: 'none', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="mtap" onClick={() => setCategory(null)} disabled={submitting} style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'Poppins, sans-serif' }}>‹ Change category</button>
            {meta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: meta.bg, borderRadius: 12, padding: 11, margin: '6px 0 6px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: meta.ac, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 9 }}>{meta.tag}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: meta.tx }}>{meta.label}</span>
              </div>
            )}
            <label style={lbl}>Customer Name <span style={{ color: '#DC2626' }}>*</span></label>
            <input style={input} value={customer} onChange={e => setCustomer(e.target.value)} placeholder="e.g. Transformers & Electricals Kerala" />
            <label style={lbl}>Site Address <span style={{ color: '#DC2626' }}>*</span></label>
            <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={site} onChange={e => setSite(e.target.value)} placeholder="Substation / plant address" />
            <label style={lbl}>Purpose of Visit <span style={{ color: '#DC2626' }}>*</span></label>
            <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Why is this visit happening?" />
            {!!error && <div style={{ color: '#DC2626', fontSize: 12, margin: '10px 0 0' }}>{error}</div>}
            <button className="mtap" onClick={() => category && detailsValid && onConfirm({ category, visitCustomerName: customer.trim(), visitSiteAddress: site.trim(), visitPurpose: purpose.trim() })}
              disabled={!detailsValid || submitting}
              style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 700, cursor: (!detailsValid || submitting) ? 'not-allowed' : 'pointer', opacity: (!detailsValid || submitting) ? 0.5 : 1, fontFamily: 'Poppins, sans-serif' }}>
              {submitting ? 'Punching in…' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
