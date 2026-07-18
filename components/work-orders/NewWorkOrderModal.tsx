'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '@/components/ui/Modal'
import { createWorkOrder } from '@/app/actions/create-work-order'
import { searchTransformersBySerial, getTransformersForCustomer } from '@/app/actions/get-work-orders'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning Activities',
  supervision: 'Supervision',
}

interface Engineer { id: string; first_name: string; last_name: string }
interface TransformerResult { transformer_id: string; serial_number: string; customer_id: string; customer_name: string; site_name: string | null; warranty_status: string }
interface SelectedSN extends TransformerResult { checked: boolean }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  engineers: Engineer[]
  prefillCustomerId?: string
  prefillCustomerName?: string
}

export default function NewWorkOrderModal({ open, onClose, onSaved, engineers, prefillCustomerId, prefillCustomerName }: Props) {
  const [woNumber, setWoNumber] = useState('')
  const [jobType, setJobType] = useState('')
  const [engineerId, setEngineerId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Serial number search
  const [snQuery, setSnQuery] = useState('')
  const [snResults, setSnResults] = useState<TransformerResult[]>([])
  const [snSearching, setSnSearching] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(prefillCustomerId || '')
  const [selectedCustomerName, setSelectedCustomerName] = useState(prefillCustomerName || '')
  const [selectedSNs, setSelectedSNs] = useState<SelectedSN[]>([])
  const [customerTransformers, setCustomerTransformers] = useState<{ id: string; serial_number: string; warranty_status: string; site_name: string | null }[]>([])
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setWoNumber(''); setJobType(''); setEngineerId(''); setScheduledDate(''); setNotes('')
      setSnQuery(''); setSnResults([]); setError('')
      if (!prefillCustomerId) {
        setSelectedCustomerId(''); setSelectedCustomerName(''); setSelectedSNs([]); setCustomerTransformers([])
      }
    }
  }, [open, prefillCustomerId])

  // Load all transformers when customer is pre-filled
  useEffect(() => {
    if (prefillCustomerId && open) {
      setSelectedCustomerId(prefillCustomerId)
      setSelectedCustomerName(prefillCustomerName || '')
      getTransformersForCustomer(prefillCustomerId).then(({ transformers }) => {
        setCustomerTransformers(transformers)
        setSelectedSNs(transformers.map(t => ({ transformer_id: t.id, serial_number: t.serial_number, customer_id: prefillCustomerId, customer_name: prefillCustomerName || '', site_name: t.site_name, warranty_status: t.warranty_status, checked: false })))
      })
    }
  }, [prefillCustomerId, prefillCustomerName, open])

  const handleSnSearch = useCallback((q: string) => {
    setSnQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.length < 2) { setSnResults([]); return }
    setSnSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const { results } = await searchTransformersBySerial(q)
      setSnResults(results)
      setSnSearching(false)
    }, 300)
  }, [])

  async function selectFromSearch(result: TransformerResult) {
    setSnQuery('')
    setSnResults([])
    if (selectedCustomerId && selectedCustomerId !== result.customer_id) {
      setError('All serial numbers must be from the same customer.')
      return
    }
    setError('')
    if (!selectedCustomerId) {
      setSelectedCustomerId(result.customer_id)
      setSelectedCustomerName(result.customer_name)
      const { transformers } = await getTransformersForCustomer(result.customer_id)
      setCustomerTransformers(transformers)
      setSelectedSNs(transformers.map(t => ({
        transformer_id: t.id, serial_number: t.serial_number, customer_id: result.customer_id,
        customer_name: result.customer_name, site_name: t.site_name, warranty_status: t.warranty_status,
        checked: t.id === result.transformer_id,
      })))
    } else {
      setSelectedSNs(prev => prev.map(s => s.transformer_id === result.transformer_id ? { ...s, checked: true } : s))
    }
  }

  function toggleSN(id: string) {
    setSelectedSNs(prev => prev.map(s => s.transformer_id === id ? { ...s, checked: !s.checked } : s))
  }

  function clearCustomer() {
    setSelectedCustomerId(''); setSelectedCustomerName(''); setSelectedSNs([]); setCustomerTransformers([]); setError('')
  }

  const checkedSNs = selectedSNs.filter(s => s.checked)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!woNumber.trim()) { setError('Notification number is required.'); return }
    if (!jobType) { setError('Please select a job type.'); return }
    if (!selectedCustomerId) { setError('Please select at least one serial number.'); return }
    if (!checkedSNs.length) { setError('Please select at least one serial number.'); return }
    setLoading(true); setError('')
    const { error: err } = await createWorkOrder({
      wo_number: woNumber.trim(),
      job_type: jobType,
      customer_id: selectedCustomerId,
      transformer_ids: checkedSNs.map(s => s.transformer_id),
      engineer_id: engineerId || null,
      scheduled_date: scheduledDate || null,
      notes: notes || null,
    })
    setLoading(false)
    if (err) { setError(err); return }
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Notification" size="lg"
      footer={
        <>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button form="wo-form" type="submit" disabled={loading} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
            {loading ? 'Creating…' : 'Create notification'}
          </button>
        </>
      }
    >
      {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
      <form id="wo-form" onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fl2}>Notification number <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={woNumber} onChange={e => setWoNumber(e.target.value)} placeholder="e.g. WO-2026-0145" />
          </div>
          <div>
            <label style={fl2}>Job type <span style={{ color: 'var(--m)' }}>*</span></label>
            <select required style={fi2} value={jobType} onChange={e => setJobType(e.target.value)}>
              <option value="">Select job type</option>
              {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Serial number search */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Serial numbers <span style={{ color: 'var(--m)' }}>*</span></label>
            {!selectedCustomerId ? (
              <div style={{ position: 'relative' }}>
                <input
                  style={fi2} value={snQuery}
                  onChange={e => handleSnSearch(e.target.value)}
                  placeholder="Search by serial number (e.g. SN-TR-01142)…"
                />
                {snSearching && <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, color: 'var(--txm)' }}>Searching…</div>}
                {snResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 200, overflow: 'hidden', marginTop: 4 }}>
                    {snResults.map(r => (
                      <div key={r.transformer_id} onClick={() => selectFromSearch(r)}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--mp)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{r.serial_number}</div>
                          <div style={{ fontSize: 10, color: 'var(--txm)' }}>{r.customer_name}{r.site_name ? ` · ${r.site_name}` : ''}</div>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: r.warranty_status === 'under_warranty' ? '#D1FAE5' : '#F3F4F6', color: r.warranty_status === 'under_warranty' ? '#065F46' : 'var(--txm)' }}>
                          {r.warranty_status === 'under_warranty' ? 'Under warranty' : r.warranty_status === 'amc' ? 'AMC' : 'Expired'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {snQuery.length >= 2 && !snSearching && snResults.length === 0 && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>No serial number found for "{snQuery}"</span>
                    <a href="/customers" style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500, textDecoration: 'none' }}>Add new customer →</a>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ border: '1.5px solid var(--gm)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ background: 'var(--mp)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--mb)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m)' }}>{selectedCustomerName}</div>
                  {!prefillCustomerId && (
                    <button type="button" onClick={clearCustomer} style={{ fontSize: 11, color: 'var(--txm)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Change customer</button>
                  )}
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {selectedSNs.map(s => (
                    <label key={s.transformer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gl)' }}>
                      <input type="checkbox" checked={s.checked} onChange={() => toggleSN(s.transformer_id)} style={{ accentColor: 'var(--m)', width: 14, height: 14 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{s.serial_number}</span>
                        {s.site_name && <span style={{ fontSize: 10, color: 'var(--txm)', marginLeft: 8 }}>{s.site_name}</span>}
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: s.warranty_status === 'under_warranty' ? '#D1FAE5' : '#F3F4F6', color: s.warranty_status === 'under_warranty' ? '#065F46' : 'var(--txm)', flexShrink: 0 }}>
                        {s.warranty_status === 'under_warranty' ? 'Under warranty' : s.warranty_status === 'amc' ? 'AMC' : 'Expired'}
                      </span>
                    </label>
                  ))}
                </div>
                {checkedSNs.length > 0 && (
                  <div style={{ padding: '6px 12px', background: 'var(--gl)', fontSize: 11, color: 'var(--txm)' }}>
                    {checkedSNs.length} serial number{checkedSNs.length > 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={fl2}>Assign engineer</label>
            <select style={fi2} value={engineerId} onChange={e => setEngineerId(e.target.value)}>
              <option value="">Unassigned</option>
              {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div>
            <label style={fl2}>Scheduled date</label>
            <input type="date" style={fi2} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Notes</label>
            <textarea style={{ ...fi2, resize: 'vertical' }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes or instructions…" />
          </div>
        </div>
      </form>
    </Modal>
  )
}
