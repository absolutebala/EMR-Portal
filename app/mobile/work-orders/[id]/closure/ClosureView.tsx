'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import SignaturePad from '@/components/mobile/SignaturePad'
import { startBackgroundClosure } from '@/lib/mobile/backgroundClosure'
import type { MobileWorkOrderWithCustomer } from '@/lib/mobile/core/shared'

interface Props {
  workOrder: MobileWorkOrderWithCustomer
}

// "Product Request" is a special reason: picking it abandons the normal pending-
// closure submission entirely and jumps straight into the product-request flow
// instead (per explicit product decision — not just recorded alongside a normal
// pending closure like the other reasons).
const PENDING_REASONS = [
  'Spare part unavailable',
  'Waiting for parts delivery',
  'Customer not available',
  'Technical dependency',
  'Project access issue',
  'Product Request',
  'Other',
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif',
  background: '#fff', boxSizing: 'border-box',
}

export default function ClosureView({ workOrder }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Reached from the dashboard's "still checked in" prompt when the engineer confirms
  // they're no longer at the site — self-reports the visit as completed without the
  // client sign-off (they're not there to get one), flagged for the manager.
  const offSite = searchParams.get('offsite') === '1'

  const [outcome, setOutcome] = useState<'completed' | 'pending' | null>(offSite ? 'completed' : null)
  const [summary, setSummary] = useState('')
  const [pendingReason, setPendingReason] = useState(PENDING_REASONS[0])
  const [materialsRequired, setMaterialsRequired] = useState('')
  const [revisitDate, setRevisitDate] = useState('')
  const [needsReassignment, setNeedsReassignment] = useState(false)
  const [engineerSignature, setEngineerSignature] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientSignature, setClientSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isProductRequest = outcome === 'pending' && pendingReason === 'Product Request'

  // Only the "pending" path (excluding the Product Request shortcut) submits through
  // this screen — "completed" hands off entirely to the job form (Complete Form
  // button below), which will capture sign-off as one of the form's own fields and
  // generate the visit PDF/Word doc once that backend piece is wired up.
  function handleSubmit() {
    if (outcome !== 'pending' || isProductRequest) return
    if (!summary.trim()) {
      setError('Please describe what remains to be done')
      return
    }
    if (!revisitDate) {
      setError('Please provide a follow-up date')
      return
    }
    if (!engineerSignature) { setError('Engineer signature is required'); return }
    if (!clientName.trim()) { setError('Client name is required'); return }
    if (!clientSignature) { setError('Client signature is required'); return }

    setSubmitting(true)
    setError('')

    // Fire the closure request in the background (queuing automatically if offline or
    // the connection drops mid-flight) and move on immediately — the request keeps
    // running after navigation and the job hub picks up the result, same as
    // CheckInView's startBackgroundCheckIn.
    startBackgroundClosure({
      workOrderId: workOrder.id,
      outcome: 'pending',
      summary: summary.trim(),
      pendingReason,
      materialsRequired: materialsRequired.trim() || null,
      revisitDate: revisitDate || null,
      needsReassignment,
      engineerSignature,
      clientName: clientName.trim(),
      clientSignature,
      offSite: false,
    })
    router.push(`/mobile/work-orders/${workOrder.id}`)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="End of Day" backHref={`/mobile/work-orders/${workOrder.id}`} rightSlot={
        <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '3px 10px' }}>
          {workOrder.wo_number}
        </span>
      } />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ background: '#3A0A1C', color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '7px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, borderRadius: 8, marginBottom: 12 }}>
          {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>

        {offSite ? (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 11, lineHeight: 1.5 }}>
            Marking this complete without being on-site — your manager will be notified.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>
              How did today&apos;s work go? <span style={{ color: '#7D1D3F' }}>*</span>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                className="mtap"
                onClick={() => setOutcome('completed')}
                style={{
                  flex: 1, border: `2px solid ${outcome === 'completed' ? '#059669' : '#E5E0E3'}`,
                  background: outcome === 'completed' ? '#ECFDF5' : '#fff', borderRadius: 10, padding: 12,
                  textAlign: 'center', cursor: 'pointer',
                }}
              >
                <div style={{ width: 28, height: 28, background: '#059669', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 7px' }}>
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#065F46' }}>Job completed</div>
                <div style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>All work done today</div>
              </div>
              <div
                className="mtap"
                onClick={() => setOutcome('pending')}
                style={{
                  flex: 1, border: `2px solid ${outcome === 'pending' ? '#D97706' : '#E5E0E3'}`,
                  background: outcome === 'pending' ? '#FEF3C7' : '#fff', borderRadius: 10, padding: 12,
                  textAlign: 'center', cursor: 'pointer',
                }}
              >
                <div style={{ width: 28, height: 28, background: '#D97706', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 7px' }}>
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>Pending — continue</div>
                <div style={{ fontSize: 10, color: '#D97706', marginTop: 2 }}>Work incomplete today</div>
              </div>
            </div>

            <button
              className="mtap"
              onClick={() => router.push(`/mobile/work-orders/${workOrder.id}/form`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
                padding: '10px', borderRadius: 8, border: '1px solid #E5E0E3', background: '#F8F5F6',
                color: '#7A6870', fontSize: 11, fontWeight: 500, cursor: 'pointer', marginTop: 10,
                fontFamily: 'Poppins, sans-serif',
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              Review &amp; submit job form
            </button>
          </div>
        )}

        {outcome === 'completed' && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 8 }}>Complete the job form</p>
            <p style={{ fontSize: 11, color: '#7A6870', lineHeight: 1.5, marginBottom: 12 }}>
              Submitting the job form marks this visit completed — your signature is captured as part of the form
              itself, and the visit summary PDF/Word doc is generated automatically.
            </p>
            <button
              className="mtap"
              onClick={() => router.push(`/mobile/work-orders/${workOrder.id}/form`)}
              style={{
                width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                background: '#059669', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
              }}
            >
              Complete Form
            </button>
          </div>
        )}

        {outcome === 'pending' && (
          <>
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontSize: 11, lineHeight: 1.5 }}>
              This notification stays In Progress with a follow-up date — your supervisor will be notified.
            </div>
            <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }}>
                  Reason <span style={{ color: '#7D1D3F' }}>*</span>
                </label>
                <select value={pendingReason} onChange={e => setPendingReason(e.target.value)} style={inputStyle}>
                  {PENDING_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {isProductRequest ? (
                <button
                  className="mtap"
                  onClick={() => router.push(`/mobile/requests/new?wo=${workOrder.id}`)}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                    background: '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
                  }}
                >
                  Go to Request Products
                </button>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }}>
                      Remarks <span style={{ color: '#7D1D3F' }}>*</span>
                    </label>
                    <textarea rows={3} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Describe what remains to be done..." style={{ ...inputStyle, resize: 'none' }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }}>
                      Materials / parts required
                    </label>
                    <textarea rows={2} value={materialsRequired} onChange={e => setMaterialsRequired(e.target.value)} placeholder="List required parts or materials..." style={{ ...inputStyle, resize: 'none' }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }}>
                      Follow-up date <span style={{ color: '#7D1D3F' }}>*</span>
                    </label>
                    <input type="date" min={new Date().toLocaleDateString('en-CA')} value={revisitDate} onChange={e => setRevisitDate(e.target.value)} style={inputStyle} />
                  </div>
                  <label
                    className="mtap"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', padding: '10px 12px',
                      borderRadius: 10, border: `1.5px solid ${needsReassignment ? '#7D1D3F' : '#E5E0E3'}`,
                      background: needsReassignment ? '#F9EEF2' : '#F8F5F6',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={needsReassignment}
                      onChange={e => setNeedsReassignment(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#7D1D3F', marginTop: 1, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>This job needs a different engineer</div>
                      <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>Flags it for your supervisor to reassign, instead of just waiting on the same engineer.</div>
                    </div>
                  </label>
                </>
              )}
            </div>
          </>
        )}

        {outcome === 'pending' && !isProductRequest && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 12 }}>Visit sign-off</p>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 6 }}>
              Engineer signature <span style={{ color: '#7D1D3F' }}>*</span>
            </label>
            <SignaturePad value={engineerSignature} onChange={setEngineerSignature} />

            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', margin: '16px 0 4px' }}>
              Client name <span style={{ color: '#7D1D3F' }}>*</span>
            </label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Name of customer representative"
              style={inputStyle}
            />

            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', margin: '16px 0 6px' }}>
              Client signature <span style={{ color: '#7D1D3F' }}>*</span>
            </label>
            <SignaturePad value={clientSignature} onChange={setClientSignature} />
          </div>
        )}

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {outcome === 'pending' && !isProductRequest && (
          <button
            className="mtap"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: submitting ? '#A8294F' : '#D97706',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            {submitting ? 'Saving…' : 'Mark job pending'}
          </button>
        )}
      </div>
    </div>
  )
}
