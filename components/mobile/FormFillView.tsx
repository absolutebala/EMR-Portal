'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { MobileWorkOrder, MobileForm, MobileFormRow } from '@/app/actions/mobile-actions'
import { JOB_TYPE_LABELS, STATUS_CONFIG } from './constants'
import SignaturePad from './SignaturePad'
import PhotoField from './PhotoField'

type FieldValues = Record<string, string>
type RowValues = Record<string, { status: string; remarks: string }>

interface Props {
  workOrder: MobileWorkOrder
  form: MobileForm | null
  existingSubmission: { id: string; form_data: Record<string, unknown> } | null
}

export default function FormFillView({ workOrder, form, existingSubmission }: Props) {
  const router = useRouter()
  const [fieldValues, setFieldValues] = useState<FieldValues>({})
  const [rowValues, setRowValues] = useState<RowValues>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const draftKey = `emr-draft-${workOrder.id}`
  const pendingKey = 'emr-pending-submissions'

  // Load initial state from existing submission or local draft
  useEffect(() => {
    const localDraft = localStorage.getItem(draftKey)
    if (localDraft) {
      try {
        const parsed = JSON.parse(localDraft)
        setFieldValues(parsed.fields || {})
        setRowValues(parsed.table_rows || {})
      } catch { /* ignore corrupt drafts */ }
    } else if (existingSubmission?.form_data) {
      const d = existingSubmission.form_data as { fields?: FieldValues; table_rows?: RowValues }
      setFieldValues(d.fields || {})
      setRowValues(d.table_rows || {})
    }

    setIsOffline(!navigator.onLine)
    const setOnline  = () => { setIsOffline(false); syncPending() }
    const setOffline = () => setIsOffline(true)
    window.addEventListener('online',  setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online',  setOnline)
      window.removeEventListener('offline', setOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save draft to localStorage on every change
  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ fields: fieldValues, table_rows: rowValues }))
  }, [fieldValues, rowValues, draftKey])

  function setField(id: string, value: string) {
    setFieldValues(prev => ({ ...prev, [id]: value }))
  }

  function setRowStatus(rowId: string, status: string) {
    setRowValues(prev => ({ ...prev, [rowId]: { ...prev[rowId], remarks: prev[rowId]?.remarks || '', status } }))
  }

  function setRowRemarks(rowId: string, remarks: string) {
    setRowValues(prev => ({ ...prev, [rowId]: { ...prev[rowId], status: prev[rowId]?.status || '', remarks } }))
  }

  async function syncPending() {
    const raw = localStorage.getItem(pendingKey)
    if (!raw) return
    const pending: { workOrderId: string; formId: string; formData: Record<string, unknown>; timestamp: number }[] = JSON.parse(raw)
    if (!pending.length) return

    const remaining = []
    for (const item of pending) {
      try {
        const res = await fetch('/api/mobile/submit-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
        if (!res.ok) remaining.push(item)
        else localStorage.removeItem(`emr-draft-${item.workOrderId}`)
      } catch {
        remaining.push(item)
      }
    }
    localStorage.setItem(pendingKey, JSON.stringify(remaining))
    if (remaining.length < pending.length) router.refresh()
  }

  const handleSubmit = useCallback(async () => {
    if (!form) return
    setSubmitting(true)
    setSubmitError('')

    const formData = { fields: fieldValues, table_rows: rowValues }

    if (!navigator.onLine) {
      // Queue for later sync
      const raw = localStorage.getItem(pendingKey)
      const pending = raw ? JSON.parse(raw) : []
      pending.push({ workOrderId: workOrder.id, formId: form.id, formData, timestamp: Date.now() })
      localStorage.setItem(pendingKey, JSON.stringify(pending))

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null)
        if (reg && 'sync' in reg) {
          await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
            .sync.register('sync-form-submissions').catch(() => {})
        }
      }

      setSavedOffline(true)
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/mobile/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId: workOrder.id, formId: form.id, formData }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Submission failed. Please try again.')
      } else {
        localStorage.removeItem(draftKey)
        setSubmitted(true)
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    }
    setSubmitting(false)
  }, [form, fieldValues, rowValues, workOrder.id, draftKey, pendingKey])

  // Service worker message listener for sync trigger
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_SUBMISSIONS') syncPending()
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (submitted) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8F5F6', padding: 32 }}>
        <div style={{ width: 72, height: 72, background: '#D1FAE5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="36" height="36" fill="none" stroke="#059669" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1C0D14', margin: '0 0 8px' }}>Form submitted!</h2>
        <p style={{ fontSize: 13, color: '#7A6870', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
          The form for {workOrder.wo_number} has been saved. Continue to end-of-day closure to mark the visit done.
        </p>
        <button
          className="mtap"
          onClick={() => router.push(`/mobile/work-orders/${workOrder.id}`)}
          style={{ background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Back to job
        </button>
      </div>
    )
  }

  if (savedOffline) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8F5F6', padding: 32 }}>
        <div style={{ width: 72, height: 72, background: '#FEF3C7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="36" height="36" fill="none" stroke="#92400E" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M1 6l4 4 4-4M5 10V3M17 17a5 5 0 01-10 0M12 12v5"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1C0D14', margin: '0 0 8px' }}>Saved offline</h2>
        <p style={{ fontSize: 13, color: '#7A6870', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
          Your submission is queued and will sync automatically when you&apos;re back online.
        </p>
        <button
          className="mtap"
          onClick={() => router.push('/mobile/dashboard')}
          style={{ background: '#7D1D3F', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
        >
          Back to dashboard
        </button>
      </div>
    )
  }

  const st = STATUS_CONFIG[workOrder.status] || STATUS_CONFIG.assigned

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F5F6', paddingBottom: 100 }}>
      {/* Top bar */}
      <div style={{
        background: '#7D1D3F', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 2px 8px rgba(61,10,28,0.25)',
      }}>
        <button
          className="mtap"
          onClick={() => router.back()}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
        >
          <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{workOrder.wo_number}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{workOrder.customer_name}</div>
        </div>
        <span style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '3px 10px' }}>
          {st.label}
        </span>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" fill="none" stroke="#92400E" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
          </svg>
          <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>You&apos;re offline — progress saves locally</span>
        </div>
      )}

      <div style={{ padding: '16px' }}>
        {/* WO summary card */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 16, border: '1px solid #E5E0E3' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ background: '#F9EEF2', color: '#7D1D3F', fontSize: 11, fontWeight: 500, borderRadius: 6, padding: '3px 10px' }}>
              {JOB_TYPE_LABELS[workOrder.job_type] || workOrder.job_type}
            </span>
            {workOrder.scheduled_date && (
              <span style={{ fontSize: 11, color: '#7A6870', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                {new Date(workOrder.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          {workOrder.serial_numbers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#7A6870', alignSelf: 'center', marginRight: 4 }}>Transformer:</span>
              {workOrder.serial_numbers.map(sn => (
                <span key={sn} style={{ background: '#F5F3F5', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500, color: '#1C0D14' }}>{sn}</span>
              ))}
            </div>
          )}
        </div>

        {!form ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 20px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 13, color: '#7A6870' }}>No form available for this job type yet.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C0D14', marginBottom: 12 }}>{form.name}</div>

            {form.sections.map(section => {
              // Fields auto-filled from job data are already shown on the job detail hub —
              // rendering them again here just duplicates that screen for no reason.
              const visibleFields = section.fields.filter(f => !f.prefill_from_job)
              if (visibleFields.length === 0 && section.tables.length === 0) return null

              return (
              <div key={section.id} style={{ marginBottom: 16 }}>
                {/* Section header */}
                <div style={{
                  background: '#7D1D3F', color: '#fff',
                  borderRadius: '12px 12px 0 0',
                  padding: '10px 14px',
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase',
                }}>
                  {section.title}
                </div>
                <div style={{ background: '#fff', borderRadius: '0 0 12px 12px', border: '1px solid #E5E0E3', borderTop: 'none', overflow: 'hidden' }}>

                  {/* Fields */}
                  {visibleFields.map((field, fi) => (
                    <div key={field.id} style={{ padding: '14px 14px', borderTop: fi > 0 ? '1px solid #F5F3F5' : 'none' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                        {field.label}
                        {field.is_required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                      </label>
                      {field.field_type === 'long_text' ? (
                        <textarea
                          value={fieldValues[field.id] || ''}
                          onChange={e => setField(field.id, e.target.value)}
                          readOnly={field.read_only_on_mobile}
                          placeholder={field.placeholder || ''}
                          rows={3}
                          style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'vertical', boxSizing: 'border-box', background: field.read_only_on_mobile ? '#F5F3F5' : '#fff' }}
                        />
                      ) : field.field_type === 'checkbox' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}>
                          <input
                            type="checkbox"
                            checked={fieldValues[field.id] === 'true'}
                            onChange={e => setField(field.id, String(e.target.checked))}
                            style={{ width: 20, height: 20, accentColor: '#7D1D3F' }}
                          />
                          <span style={{ fontSize: 14, color: '#1C0D14' }}>Yes</span>
                        </label>
                      ) : field.field_type === 'signature' ? (
                        <SignaturePad
                          value={fieldValues[field.id] || ''}
                          onChange={dataUrl => setField(field.id, dataUrl)}
                          readOnly={field.read_only_on_mobile}
                        />
                      ) : field.field_type === 'photo' ? (
                        <PhotoField
                          value={fieldValues[field.id] || ''}
                          onChange={dataUrl => setField(field.id, dataUrl)}
                          readOnly={field.read_only_on_mobile}
                        />
                      ) : (
                        <input
                          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                          value={fieldValues[field.id] || ''}
                          onChange={e => setField(field.id, e.target.value)}
                          readOnly={field.read_only_on_mobile}
                          placeholder={field.placeholder || ''}
                          style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box', background: field.read_only_on_mobile ? '#F5F3F5' : '#fff' }}
                        />
                      )}
                      {field.help_text && (
                        <div style={{ fontSize: 11, color: '#7A6870', marginTop: 4 }}>{field.help_text}</div>
                      )}
                    </div>
                  ))}

                  {/* Tables */}
                  {section.tables.map((table, ti) => {
                    const topRows = table.rows.filter(r => !r.parent_row_id)
                    const childMap: Record<string, MobileFormRow[]> = {}
                    table.rows.filter(r => r.parent_row_id).forEach(r => {
                      if (!childMap[r.parent_row_id!]) childMap[r.parent_row_id!] = []
                      childMap[r.parent_row_id!].push(r)
                    })

                    return (
                      <div key={table.id} style={{ borderTop: (ti > 0 || visibleFields.length > 0) ? '1px solid #F5F3F5' : 'none' }}>
                        {renderTable(table.status_type, topRows, childMap, rowValues, setRowStatus, setRowRemarks)}
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}
          </>
        )}
      </div>

      {/* Sticky submit footer */}
      {form && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #E5E0E3',
          padding: '14px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}>
          {submitError && (
            <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 8, textAlign: 'center' }}>{submitError}</div>
          )}
          <button
            className="mtap"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '15px',
              background: submitting ? '#A8294F' : '#7D1D3F',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            {submitting ? 'Submitting…' : isOffline ? 'Save offline' : 'Submit form'}
          </button>
        </div>
      )}
    </div>
  )
}

function renderTable(
  statusType: string,
  topRows: MobileFormRow[],
  childMap: Record<string, MobileFormRow[]>,
  rowValues: RowValues,
  setRowStatus: (id: string, status: string) => void,
  setRowRemarks: (id: string, remarks: string) => void
) {
  if (statusType === 'yes_no') {
    return (
      <div>
        {topRows.map((row, i) => (
          <div key={row.id}>
            <YesNoRow row={row} indent={false} index={i} rowValues={rowValues} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} />
            {(childMap[row.id] || []).map((child, ci) => (
              <YesNoRow key={child.id} row={child} indent index={ci} rowValues={rowValues} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (statusType === 'tested_not_tested') {
    return (
      <div>
        {topRows.map((row, i) => (
          <div key={row.id}>
            <TestedRow row={row} indent={false} index={i} rowValues={rowValues} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} />
            {(childMap[row.id] || []).map((child, ci) => (
              <TestedRow key={child.id} row={child} indent index={ci} rowValues={rowValues} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (statusType === 'checkbox_only') {
    return (
      <div>
        {topRows.map((row, i) => (
          <div key={row.id} style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid #F5F3F5' : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              checked={rowValues[row.id]?.status === 'checked'}
              onChange={e => setRowStatus(row.id, e.target.checked ? 'checked' : '')}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: '#7D1D3F', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#1C0D14', lineHeight: 1.4 }}>
              {row.sno_label && <span style={{ color: '#7A6870', marginRight: 4 }}>{row.sno_label}.</span>}
              {row.row_label}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // two_party / two_party_exclusive
  if (statusType === 'two_party' || statusType === 'two_party_exclusive') {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 0, background: '#F5F3F5', padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#7A6870' }}>
          <span>Item</span>
          <span style={{ textAlign: 'center' }}>Col 1</span>
          <span style={{ textAlign: 'center' }}>Col 2</span>
        </div>
        {topRows.map((row, i) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', borderTop: '1px solid #F5F3F5', padding: '10px 14px', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#1C0D14', lineHeight: 1.4 }}>
              {row.sno_label && <span style={{ color: '#7A6870', marginRight: 4 }}>{row.sno_label}.</span>}
              {row.row_label}
            </span>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <input type="checkbox" checked={rowValues[row.id]?.status === 'col1'} onChange={e => setRowStatus(row.id, e.target.checked ? 'col1' : '')} style={{ width: 20, height: 20, accentColor: '#7D1D3F' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <input type="checkbox" checked={rowValues[row.id]?.status === 'col2'} onChange={e => setRowStatus(row.id, e.target.checked ? 'col2' : '')} style={{ width: 20, height: 20, accentColor: '#7D1D3F' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // observation / measurement: text input per row
  return (
    <div>
      {topRows.map((row, i) => (
        <div key={row.id} style={{ padding: '12px 14px', borderTop: i > 0 ? '1px solid #F5F3F5' : 'none' }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6, fontWeight: 500 }}>
            {row.sno_label && <span style={{ color: '#7A6870', marginRight: 4 }}>{row.sno_label}.</span>}
            {row.row_label}
          </div>
          <input
            type={statusType === 'measurement' ? 'number' : 'text'}
            value={rowValues[row.id]?.remarks || ''}
            onChange={e => setRowRemarks(row.id, e.target.value)}
            placeholder={statusType === 'measurement' ? 'Enter value' : 'Enter observation'}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }}
          />
        </div>
      ))}
    </div>
  )
}

interface RowProps {
  row: MobileFormRow
  indent: boolean
  index: number
  rowValues: RowValues
  setRowStatus: (id: string, status: string) => void
  setRowRemarks: (id: string, remarks: string) => void
}

function YesNoRow({ row, indent, index, rowValues, setRowStatus, setRowRemarks }: RowProps) {
  const val = rowValues[row.id] || { status: '', remarks: '' }
  return (
    <div style={{ borderTop: index > 0 || indent ? '1px solid #F5F3F5' : 'none', padding: '12px 14px', paddingLeft: indent ? 28 : 14, background: indent ? '#FAFAFA' : '#fff' }}>
      <div style={{ fontSize: 13, color: '#1C0D14', marginBottom: 10, lineHeight: 1.4 }}>
        {row.sno_label && <span style={{ color: '#7A6870', marginRight: 5, fontWeight: 500 }}>{row.sno_label}.</span>}
        {row.row_label}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: val.status ? 8 : 0 }}>
        <button
          type="button"
          onClick={() => setRowStatus(row.id, val.status === 'yes' ? '' : 'yes')}
          style={{
            flex: 1, padding: '10px',
            background: val.status === 'yes' ? '#059669' : '#fff',
            color: val.status === 'yes' ? '#fff' : '#374151',
            border: `2px solid ${val.status === 'yes' ? '#059669' : '#E5E0E3'}`,
            borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          ✓ Yes
        </button>
        <button
          type="button"
          onClick={() => setRowStatus(row.id, val.status === 'no' ? '' : 'no')}
          style={{
            flex: 1, padding: '10px',
            background: val.status === 'no' ? '#DC2626' : '#fff',
            color: val.status === 'no' ? '#fff' : '#374151',
            border: `2px solid ${val.status === 'no' ? '#DC2626' : '#E5E0E3'}`,
            borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          ✗ No
        </button>
      </div>
      {val.status && (
        <input
          type="text"
          value={val.remarks}
          onChange={e => setRowRemarks(row.id, e.target.value)}
          placeholder="Remarks (optional)"
          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E0E3', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}

function TestedRow({ row, indent, index, rowValues, setRowStatus, setRowRemarks }: RowProps) {
  const val = rowValues[row.id] || { status: '', remarks: '' }
  return (
    <div style={{ borderTop: index > 0 || indent ? '1px solid #F5F3F5' : 'none', padding: '12px 14px', paddingLeft: indent ? 28 : 14, background: indent ? '#FAFAFA' : '#fff' }}>
      <div style={{ fontSize: 13, color: '#1C0D14', marginBottom: 10, lineHeight: 1.4 }}>
        {row.sno_label && <span style={{ color: '#7A6870', marginRight: 5, fontWeight: 500 }}>{row.sno_label}.</span>}
        {row.row_label}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: val.status ? 8 : 0 }}>
        <button
          type="button"
          onClick={() => setRowStatus(row.id, val.status === 'tested' ? '' : 'tested')}
          style={{
            flex: 1, padding: '10px 6px',
            background: val.status === 'tested' ? '#1E40AF' : '#fff',
            color: val.status === 'tested' ? '#fff' : '#374151',
            border: `2px solid ${val.status === 'tested' ? '#1E40AF' : '#E5E0E3'}`,
            borderRadius: 10, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          Tested
        </button>
        <button
          type="button"
          onClick={() => setRowStatus(row.id, val.status === 'not_tested' ? '' : 'not_tested')}
          style={{
            flex: 1, padding: '10px 6px',
            background: val.status === 'not_tested' ? '#7A6870' : '#fff',
            color: val.status === 'not_tested' ? '#fff' : '#374151',
            border: `2px solid ${val.status === 'not_tested' ? '#7A6870' : '#E5E0E3'}`,
            borderRadius: 10, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
            transition: 'all 0.15s',
          }}
        >
          Not Tested
        </button>
      </div>
      {val.status && (
        <input
          type="text"
          value={val.remarks}
          onChange={e => setRowRemarks(row.id, e.target.value)}
          placeholder="Remarks (optional)"
          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E5E0E3', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins, sans-serif', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}
