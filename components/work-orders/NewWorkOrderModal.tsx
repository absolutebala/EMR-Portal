'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { createWorkOrder, getNextTicketNumberPreview } from '@/app/actions/create-work-order'
import { searchTransformersBySerial, searchCustomersByName, getTransformersForCustomer, getAssignableEngineers } from '@/app/actions/get-work-orders'
import { getMyAssignableDepartments } from '@/app/actions/departments'
import type { Department } from '@/lib/departments'
import CustomerCategoryPicker from './CustomerCategoryPicker'
import type { CustomerCategoryType } from '@/app/actions/customer-categories'
import AddCustomerModal from '@/components/customers/AddCustomerModal'

const REPORTED_THROUGH_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'other', label: 'Other' },
]

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning',
  supervision: 'Supervision',
  overhauling: 'Overhauling',
  complaint: 'Complaint',
  installation: 'Installation',
  testing: 'Testing',
  business_opportunity: 'Business Opportunity',
}

interface TransformerResult { transformer_id: string; serial_number: string; customer_id: string; customer_name: string; site_name: string | null; warranty_status: string }
interface SelectedSN extends TransformerResult { checked: boolean }
interface CustomerResult { customer_id: string; name: string; phone: string; contact_person: string }
interface Engineer { id: string; first_name: string; last_name: string }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  prefillCustomerId?: string
  prefillCustomerName?: string
}

export default function NewWorkOrderModal({ open, onClose, onSaved, prefillCustomerId, prefillCustomerName }: Props) {
  const router = useRouter()
  const [woNumber, setWoNumber] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [jobType, setJobType] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New intake/coordination fields
  const [reportedDate, setReportedDate] = useState('')
  const [reportedThrough, setReportedThrough] = useState('')
  const [customerMessage, setCustomerMessage] = useState('')
  const [solutionThrough, setSolutionThrough] = useState('')
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [additionalEngineerIds, setAdditionalEngineerIds] = useState<string[]>([])
  const [customerType, setCustomerType] = useState<CustomerCategoryType | ''>('')
  const [customerCategoryId, setCustomerCategoryId] = useState('')
  const [customerCategoryName, setCustomerCategoryName] = useState('')
  const [engineerId, setEngineerId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentId, setDepartmentId] = useState('')

  // Adding a brand-new customer used to send the user to /customers and back — now
  // it opens inline, on top of this modal, so creating a notification for a customer
  // that doesn't exist yet is a single uninterrupted flow.
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addCustomerPrefillName, setAddCustomerPrefillName] = useState('')

  // Customer name search
  const [custQuery, setCustQuery] = useState('')
  const [custResults, setCustResults] = useState<CustomerResult[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const custSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Serial number search
  const [snQuery, setSnQuery] = useState('')
  const [snResults, setSnResults] = useState<TransformerResult[]>([])
  const [snSearching, setSnSearching] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(prefillCustomerId || '')
  const [selectedCustomerName, setSelectedCustomerName] = useState(prefillCustomerName || '')
  const [selectedSNs, setSelectedSNs] = useState<SelectedSN[]>([])
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setWoNumber(''); setTicketNumber(''); setJobType(''); setNotes('')
      setSnQuery(''); setSnResults([]); setCustQuery(''); setCustResults([]); setError('')
      setReportedDate(''); setReportedThrough(''); setCustomerMessage(''); setSolutionThrough(''); setAdditionalEngineerIds([])
      setCustomerType(''); setCustomerCategoryId(''); setCustomerCategoryName('')
      setEngineerId(''); setScheduledDate('')
      setDepartmentId('')
      if (!prefillCustomerId) {
        setSelectedCustomerId(''); setSelectedCustomerName(''); setSelectedSNs([])
      }
    } else {
      getNextTicketNumberPreview().then(({ ticketNumber: t }) => setTicketNumber(t))
      getAssignableEngineers().then(({ engineers: eng }) => setEngineers(eng))
      getMyAssignableDepartments().then(({ departments: depts }) => {
        setDepartments(depts)
        // Auto-select the common case: the creating user is assigned to exactly
        // one department. Otherwise left blank for them to pick.
        if (depts.length === 1) setDepartmentId(depts[0].id)
      })
      setReportedDate(new Date().toLocaleDateString('en-CA'))
      // Scheduled date only accepts today-or-later (see the input's `min` below) —
      // default it to today so the user adjusts a pre-filled date rather than
      // typing one from scratch.
      setScheduledDate(new Date().toLocaleDateString('en-CA'))
    }
  }, [open, prefillCustomerId])

  // Load all transformers when customer is pre-filled
  useEffect(() => {
    if (prefillCustomerId && open) {
      setSelectedCustomerId(prefillCustomerId)
      setSelectedCustomerName(prefillCustomerName || '')
      getTransformersForCustomer(prefillCustomerId).then(({ transformers }) => {
        setSelectedSNs(transformers.map(t => ({ transformer_id: t.id, serial_number: t.serial_number, customer_id: prefillCustomerId, customer_name: prefillCustomerName || '', site_name: t.site_name, warranty_status: t.warranty_status, checked: false })))
      })
    }
  }, [prefillCustomerId, prefillCustomerName, open])

  const selectCustomer = useCallback(async (customerId: string, customerName: string) => {
    setCustQuery(''); setCustResults([]); setSnQuery(''); setSnResults([]); setError('')
    setSelectedCustomerId(customerId)
    setSelectedCustomerName(customerName)
    const { transformers } = await getTransformersForCustomer(customerId)
    setSelectedSNs(transformers.map(t => ({
      transformer_id: t.id, serial_number: t.serial_number, customer_id: customerId,
      customer_name: customerName, site_name: t.site_name, warranty_status: t.warranty_status, checked: false,
    })))
  }, [])

  const handleCustomerSearch = useCallback((q: string) => {
    setCustQuery(q)
    if (custSearchTimeout.current) clearTimeout(custSearchTimeout.current)
    setCustSearching(true)
    custSearchTimeout.current = setTimeout(async () => {
      const { results } = await searchCustomersByName(q)
      setCustResults(results)
      setCustSearching(false)
    }, 300)
  }, [])

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
      await selectCustomer(result.customer_id, result.customer_name)
      setSelectedSNs(prev => prev.map(s => s.transformer_id === result.transformer_id ? { ...s, checked: true } : s))
    } else {
      setSelectedSNs(prev => prev.map(s => s.transformer_id === result.transformer_id ? { ...s, checked: true } : s))
    }
  }

  function toggleSN(id: string) {
    setSelectedSNs(prev => prev.map(s => s.transformer_id === id ? { ...s, checked: !s.checked } : s))
  }

  function clearCustomer() {
    setSelectedCustomerId(''); setSelectedCustomerName(''); setSelectedSNs([]); setError('')
  }

  function toggleAdditionalEngineer(id: string) {
    setAdditionalEngineerIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id])
  }

  const checkedSNs = selectedSNs.filter(s => s.checked)
  // Overhauling notifications can be created with just a job type — every other
  // field, including customer/serial number, gets filled in later.
  const isOverhauling = jobType === 'overhauling'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobType) { setError('Please select a job type.'); return }
    if (!isOverhauling && !selectedCustomerId) { setError('Please select a customer.'); return }
    if (!isOverhauling && !checkedSNs.length) { setError('Please select at least one serial number.'); return }
    setLoading(true); setError('')
    const { error: err, id } = await createWorkOrder({
      wo_number: woNumber.trim(),
      job_type: jobType,
      customer_id: selectedCustomerId || null,
      transformer_ids: checkedSNs.map(s => s.transformer_id),
      engineer_id: engineerId || null,
      scheduled_date: scheduledDate || null,
      notes: notes || null,
      reported_date: reportedDate || null,
      reported_through: reportedThrough || null,
      customer_message: customerMessage || null,
      solution_through: solutionThrough || null,
      additional_engineer_ids: solutionThrough === 'virtual' ? additionalEngineerIds : [],
      customer_type: customerType || null,
      customer_category_id: customerCategoryId || null,
      department_id: departmentId || null,
    })
    setLoading(false)
    if (err) { setError(err); return }
    onSaved()
    onClose()
    if (id) router.push(`/work-orders/${id}`)
  }

  return (
    <>
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
            <label style={fl2}>Ticket number</label>
            <input disabled style={{ ...fi2, background: 'var(--gl)', color: 'var(--txm)' }} value={ticketNumber || 'Generating…'} readOnly />
          </div>
          <div>
            <label style={fl2}>Notification number</label>
            <input style={fi2} value={woNumber} onChange={e => setWoNumber(e.target.value)} placeholder="Leave blank to use the ticket number" />
          </div>
          <div>
            <label style={fl2}>Job type <span style={{ color: 'var(--m)' }}>*</span></label>
            <select required style={fi2} value={jobType} onChange={e => setJobType(e.target.value)}>
              <option value="">Select job type</option>
              {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={fl2}>Assign engineer</label>
            <select style={fi2} value={engineerId} onChange={e => setEngineerId(e.target.value)}>
              <option value="">Unassigned — assign later</option>
              {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div>
            <label style={fl2}>Scheduled date</label>
            <input type="date" style={fi2} value={scheduledDate} min={new Date().toLocaleDateString('en-CA')} onChange={e => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <label style={fl2}>Department</label>
            <select style={fi2} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Serial number search */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Serial numbers {!isOverhauling && <span style={{ color: 'var(--m)' }}>*</span>}</label>
            {!selectedCustomerId ? (
              <div style={{ position: 'relative' }}>
                <input
                  style={fi2} value={snQuery}
                  onChange={e => handleSnSearch(e.target.value)}
                  placeholder="Or search by serial number (e.g. SN-TR-01142)…"
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
                    <span>No serial number found for &quot;{snQuery}&quot;</span>
                    <button type="button" onClick={() => { setAddCustomerPrefillName(''); setShowAddCustomer(true) }} style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Add new customer →</button>
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

          {!selectedCustomerId && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fl2}>Customer {!isOverhauling && <span style={{ color: 'var(--m)' }}>*</span>}</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={fi2} value={custQuery}
                  onChange={e => handleCustomerSearch(e.target.value)}
                  onFocus={() => { if (custResults.length === 0 && !custSearching) handleCustomerSearch(custQuery) }}
                  placeholder="Click to browse or search by customer name…"
                />
                {custSearching && <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, color: 'var(--txm)' }}>Searching…</div>}
                {custResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 200, overflow: 'hidden', overflowY: 'auto', maxHeight: 260, marginTop: 4 }}>
                    {custResults.map(c => (
                      <div key={c.customer_id} onClick={() => selectCustomer(c.customer_id, c.name)}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gm)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--mp)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--txm)' }}>{c.contact_person} · {c.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
                {custQuery.length >= 1 && !custSearching && custResults.length === 0 && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>No customer found for &quot;{custQuery}&quot;</span>
                    <button type="button" onClick={() => { setAddCustomerPrefillName(custQuery); setShowAddCustomer(true) }} style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Add new customer →</button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>End user type</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: customerType ? 10 : 0 }}>
              {[{ value: 'utility', label: 'Utility' }, { value: 'industry', label: 'Industry' }, { value: 'oem', label: 'OEM' }].map(o => (
                <button key={o.value} type="button"
                  onClick={() => { setCustomerType(o.value as CustomerCategoryType); setCustomerCategoryId(''); setCustomerCategoryName('') }}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif',
                    border: `1.5px solid ${customerType === o.value ? 'var(--m)' : 'var(--gm)'}`,
                    background: customerType === o.value ? 'var(--mp)' : '#fff',
                    color: customerType === o.value ? 'var(--m)' : 'var(--tx)',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
            {customerType && (
              <CustomerCategoryPicker
                customerType={customerType}
                valueId={customerCategoryId}
                valueName={customerCategoryName}
                onChange={(id, name) => { setCustomerCategoryId(id); setCustomerCategoryName(name) }}
              />
            )}
          </div>

          <div>
            <label style={fl2}>Reported date</label>
            <input type="date" style={fi2} value={reportedDate} onChange={e => setReportedDate(e.target.value)} max={new Date().toLocaleDateString('en-CA')} />
          </div>
          <div>
            <label style={fl2}>Reported through</label>
            <select style={fi2} value={reportedThrough} onChange={e => setReportedThrough(e.target.value)}>
              <option value="">Select…</option>
              {REPORTED_THROUGH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Customer message</label>
            <textarea style={{ ...fi2, resize: 'vertical' }} rows={2} value={customerMessage} onChange={e => setCustomerMessage(e.target.value)} placeholder="What the customer reported…" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Solution through</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ value: 'on_site', label: 'On-Site' }, { value: 'virtual', label: 'Virtual' }].map(o => (
                <button key={o.value} type="button" onClick={() => setSolutionThrough(o.value)}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif',
                    border: `1.5px solid ${solutionThrough === o.value ? 'var(--m)' : 'var(--gm)'}`,
                    background: solutionThrough === o.value ? 'var(--mp)' : '#fff',
                    color: solutionThrough === o.value ? 'var(--m)' : 'var(--tx)',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {solutionThrough === 'virtual' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fl2}>Additional engineers (virtual participants)</label>
              <div style={{ border: '1.5px solid var(--gm)', borderRadius: 7, maxHeight: 150, overflowY: 'auto' }}>
                {engineers.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--txm)' }}>No field engineers found.</div>
                ) : engineers.map((e, i) => (
                  <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--gl)' : 'none' }}>
                    <input type="checkbox" checked={additionalEngineerIds.includes(e.id)} onChange={() => toggleAdditionalEngineer(e.id)} style={{ accentColor: 'var(--m)', width: 14, height: 14 }} />
                    <span style={{ fontSize: 12, color: 'var(--tx)' }}>{e.first_name} {e.last_name}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 4 }}>Listed for coordination only — doesn&apos;t affect scheduling or mobile assignment.</div>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Notes</label>
            <textarea style={{ ...fi2, resize: 'vertical' }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes or instructions…" />
          </div>
        </div>
      </form>
    </Modal>
    <AddCustomerModal
      open={showAddCustomer}
      onClose={() => setShowAddCustomer(false)}
      onSaved={() => {}}
      prefillName={addCustomerPrefillName}
      onCreateWorkOrder={(customerId, customerName) => {
        selectCustomer(customerId, customerName)
        setShowAddCustomer(false)
      }}
    />
    </>
  )
}
