'use client'

import { useEffect, useState } from 'react'
import { TOP_OPTIONS, SUB_OPTIONS, combineCategory, categoryMeta, type PunchCategory, type TopCategory, type SubCategory } from '@/lib/punchCategory'

export interface PunchInPayload {
  category: PunchCategory
  visitCustomerName: string | null
  visitSiteAddress: string | null
  visitPurpose: string | null
}

// Punch-in flow (PWA): pick a top-level category; Travel / Site Visit then pick a
// sub-type; every category except HQ then fills the mandatory visit details before the
// actual GPS check-in the parent runs. HQ confirms straight away.
export default function PunchInModal({ open, onCancel, onConfirm, submitting, error, title, subtitle }: {
  open: boolean
  onCancel: () => void
  onConfirm: (p: PunchInPayload) => void
  submitting: boolean
  error: string
  title?: string
  subtitle?: string
}) {
  const [step, setStep] = useState<'top' | 'sub' | 'details' | 'confirm'>('top')
  const [top, setTop] = useState<TopCategory | null>(null)
  const [category, setCategory] = useState<PunchCategory | null>(null)
  const [customer, setCustomer] = useState('')
  const [site, setSite] = useState('')
  const [purpose, setPurpose] = useState('')

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) { setStep('top'); setTop(null); setCategory(null); setCustomer(''); setSite(''); setPurpose('') } }, [open])

  if (!open) return null

  function pickTop(id: TopCategory) {
    const opt = TOP_OPTIONS.find(o => o.id === id)!
    setTop(id)
    if (opt.needsSub) { setStep('sub'); return }
    // No visit details needed (HQ): don't mark immediately — show a Submit confirmation
    // step first so the engineer explicitly commits.
    if (!opt.needsDetails) { setCategory(opt.directCategory!); setStep('confirm'); return }
    setCategory(opt.directCategory!)
    setStep('details')
  }
  function pickSub(sub: SubCategory) {
    if (!top) return
    setCategory(combineCategory(top, sub))
    setStep('details')
  }

  const detailsValid = !!customer.trim() && !!site.trim() && !!purpose.trim()
  const meta = categoryMeta(category)
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 13, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', margin: '10px 0 5px' }
  const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: '1.5px solid #EFE7EA', borderRadius: 13, padding: 12, marginBottom: 10, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'Poppins, sans-serif' }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '16px 18px 24px', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: '#E5E0E3', margin: '0 auto 14px' }} />

        {step === 'top' && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1C0D14' }}>{title ?? 'What are you doing today?'}</div>
            <div style={{ fontSize: 12, color: '#7A6870', margin: '3px 0 14px' }}>{subtitle ?? 'Choose one to continue punching in.'}</div>
            {TOP_OPTIONS.map(o => {
              const m = o.directCategory ? categoryMeta(o.directCategory) : null
              const chipBg = m?.bg ?? '#EEF0F2'
              const chipTx = m?.tx ?? '#4B5563'
              return (
                <button key={o.id} className="mtap" onClick={() => pickTop(o.id)} disabled={submitting} style={rowBtn}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: chipBg, color: chipTx, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{o.label[0]}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1C0D14' }}>{o.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#7A6870' }}>{o.desc}</span>
                  </span>
                  <span style={{ color: '#B9AEB3', fontSize: 20 }}>›</span>
                </button>
              )
            })}
            {!!error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
            <button className="mtap" onClick={onCancel} disabled={submitting} style={{ width: '100%', padding: 12, background: 'none', border: 'none', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Cancel</button>
          </>
        )}

        {step === 'sub' && top && (
          <>
            <button className="mtap" onClick={() => setStep('top')} disabled={submitting} style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'Poppins, sans-serif' }}>‹ Back</button>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1C0D14', margin: '4px 0 2px' }}>{TOP_OPTIONS.find(o => o.id === top)?.label}</div>
            <div style={{ fontSize: 12, color: '#7A6870', marginBottom: 14 }}>Choose the type.</div>
            {SUB_OPTIONS.map(s => {
              const m = categoryMeta(combineCategory(top, s.id))
              return (
                <button key={s.id} className="mtap" onClick={() => pickSub(s.id)} disabled={submitting} style={rowBtn}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: m?.bg ?? '#EEF0F2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: m?.ac ?? '#9CA3AF' }} />
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#1C0D14' }}>{s.label}</span>
                  <span style={{ color: '#B9AEB3', fontSize: 20 }}>›</span>
                </button>
              )
            })}
          </>
        )}

        {step === 'confirm' && (
          <>
            <button className="mtap" onClick={() => setStep('top')} disabled={submitting} style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'Poppins, sans-serif' }}>‹ Back</button>
            {meta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: meta.bg, borderRadius: 12, padding: 11, margin: '6px 0 6px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: meta.ac, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 9 }}>{meta.tag[0]}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: meta.tx }}>{meta.label}</span>
              </div>
            )}
            <div style={{ fontSize: 13, color: '#4B5563', margin: '8px 0 4px' }}>Confirm your status as {meta?.label ?? 'HQ'}.</div>
            {!!error && <div style={{ color: '#DC2626', fontSize: 12, margin: '10px 0 0' }}>{error}</div>}
            <button className="mtap" onClick={() => category && onConfirm({ category, visitCustomerName: null, visitSiteAddress: null, visitPurpose: null })}
              disabled={submitting}
              style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1, fontFamily: 'Poppins, sans-serif' }}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </>
        )}

        {step === 'details' && (
          <>
            <button className="mtap" onClick={() => setStep(top && TOP_OPTIONS.find(o => o.id === top)?.needsSub ? 'sub' : 'top')} disabled={submitting} style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'Poppins, sans-serif' }}>‹ Back</button>
            {meta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: meta.bg, borderRadius: 12, padding: 11, margin: '6px 0 6px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: meta.ac, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 9 }}>{meta.tag[0]}</span>
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
