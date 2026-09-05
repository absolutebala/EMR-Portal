'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import {
  listCustomersMobile, listTransformersForCustomer, createCustomerMobile, createNotificationMobile,
} from '@/app/actions/create-notification-mobile'
import type { MobileCustomerOption, MobileTransformerOption } from '@/lib/mobile/core/create-notification'

const JOB_TYPES: { value: string; label: string }[] = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'amc', label: 'AMC' },
  { value: 'commissioning_activities', label: 'Commissioning' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'overhauling', label: 'Overhauling' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'installation', label: 'Installation' },
  { value: 'testing', label: 'Testing' },
  { value: 'business_opportunity', label: 'Business Opportunity' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif',
  background: '#fff', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#7A6870', marginBottom: 4 }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 13, padding: 13, marginBottom: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }

export default function NewNotificationClient() {
  const router = useRouter()

  const [jobType, setJobType] = useState('')
  const [customers, setCustomers] = useState<MobileCustomerOption[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [transformers, setTransformers] = useState<MobileTransformerOption[]>([])
  const [selectedTransformerIds, setSelectedTransformerIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // New-customer sub-form
  const [cName, setCName] = useState('')
  const [cContact, setCContact] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cType, setCType] = useState<'sold' | 'shipped' | 'both'>('both')
  const [cPincode, setCPincode] = useState('')
  const [cSite, setCSite] = useState('')
  const [cSerial, setCSerial] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState('')

  useEffect(() => {
    listCustomersMobile().then(({ customers: c }) => setCustomers(c)).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedTransformerIds([])
    if (!customerId) { setTransformers([]); return }
    listTransformersForCustomer(customerId).then(({ transformers: t }) => setTransformers(t)).catch(() => {})
  }, [customerId])

  function toggleTransformer(id: string) {
    setSelectedTransformerIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function handleSaveCustomer() {
    setCustomerError('')
    if (!cName.trim()) { setCustomerError('Enter the customer name'); return }
    if (!cContact.trim()) { setCustomerError('Enter a contact person'); return }
    if (!cPhone.trim()) { setCustomerError('Enter a phone number'); return }
    if (!/^\d{6}$/.test(cPincode.trim())) { setCustomerError('Enter a valid 6-digit pincode'); return }
    setSavingCustomer(true)
    const result = await createCustomerMobile({
      name: cName.trim(), contactPerson: cContact.trim(), phone: cPhone.trim(),
      type: cType, pincode: cPincode.trim(), siteName: cSite.trim() || null, serialNumber: cSerial.trim() || null,
    })
    setSavingCustomer(false)
    if (result.error || !result.id) { setCustomerError(result.error || 'Could not add customer'); return }
    const { customers: c } = await listCustomersMobile()
    setCustomers(c)
    setCustomerId(result.id)
    setAddingCustomer(false)
    setCName(''); setCContact(''); setCPhone(''); setCType('both'); setCPincode(''); setCSite(''); setCSerial('')
  }

  async function handleSubmit() {
    setError('')
    if (!jobType) { setError('Select a job type'); return }
    setSubmitting(true)
    const result = await createNotificationMobile({
      jobType,
      customerId: customerId || null,
      transformerIds: selectedTransformerIds,
      notes: notes.trim() || null,
    })
    setSubmitting(false)
    if (result.error || !result.id) { setError(result.error || 'Could not create notification'); return }
    router.replace(`/mobile/work-orders/${result.id}`)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="New Notification" backHref="/mobile/jobs" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={cardStyle}>
          <label style={labelStyle}>Job type <span style={{ color: '#7D1D3F' }}>*</span></label>
          <select value={jobType} onChange={e => setJobType(e.target.value)} style={inputStyle}>
            <option value="">Select job type…</option>
            {JOB_TYPES.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Customer</label>
            <button className="mtap" onClick={() => setAddingCustomer(v => !v)}
              style={{ background: 'none', border: 'none', color: '#7D1D3F', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {addingCustomer ? 'Pick existing' : '＋ New customer'}
            </button>
          </div>

          {!addingCustomer ? (() => {
            const selected = customers.find(c => c.id === customerId)
            const q = customerSearch.trim().toLowerCase()
            const matches = q ? customers.filter(c => c.name.toLowerCase().includes(q)) : customers
            return (
              <div>
                <input
                  value={selected ? selected.name : customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); if (customerId) setCustomerId('') }}
                  placeholder="Search customer by name…"
                  style={inputStyle}
                />
                {!customerId && customerSearch.trim() && (
                  <div style={{ marginTop: 6, border: '1.5px solid #E5E0E3', borderRadius: 10, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    {matches.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: '#7A6870' }}>No customer found. Tap “＋ New customer” above to add one.</div>
                    ) : matches.slice(0, 25).map(c => (
                      <button key={c.id} className="mtap" onClick={() => { setCustomerId(c.id); setCustomerSearch('') }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #F5F3F5', background: '#fff', fontSize: 12, color: '#1C0D14', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <button className="mtap" onClick={() => { setCustomerId(''); setCustomerSearch('') }}
                    style={{ marginTop: 6, padding: 0, background: 'none', border: 'none', color: '#7D1D3F', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                    Change customer
                  </button>
                )}
              </div>
            )
          })() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Customer name *" style={inputStyle} />
              <input value={cContact} onChange={e => setCContact(e.target.value)} placeholder="Contact person *" style={inputStyle} />
              <input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="Phone *" inputMode="tel" style={inputStyle} />
              <input value={cPincode} onChange={e => setCPincode(e.target.value)} placeholder="Pincode (6 digits) *" inputMode="numeric" style={inputStyle} />
              <select value={cType} onChange={e => setCType(e.target.value as 'sold' | 'shipped' | 'both')} style={inputStyle}>
                <option value="sold">Sold customer</option>
                <option value="shipped">Shipped customer</option>
                <option value="both">Both</option>
              </select>
              <input value={cSite} onChange={e => setCSite(e.target.value)} placeholder="Site name (optional)" style={inputStyle} />
              <input value={cSerial} onChange={e => setCSerial(e.target.value)} placeholder="Transformer serial no. (optional)" style={inputStyle} />
              {customerError && <div style={{ color: '#DC2626', fontSize: 11 }}>{customerError}</div>}
              <button className="mtap" onClick={handleSaveCustomer} disabled={savingCustomer}
                style={{ padding: '11px', borderRadius: 10, border: '1px solid #7D1D3F', background: '#fff', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: savingCustomer ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                {savingCustomer ? 'Saving…' : 'Save customer'}
              </button>
            </div>
          )}
        </div>

        {!addingCustomer && customerId && transformers.length > 0 && (
          <div style={cardStyle}>
            <label style={labelStyle}>Transformer(s)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {transformers.map(t => {
                const on = selectedTransformerIds.includes(t.id)
                return (
                  <button key={t.id} className="mtap" onClick={() => toggleTransformer(t.id)}
                    style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
                      border: `1.5px solid ${on ? '#7D1D3F' : '#E5E0E3'}`, background: on ? '#F9EEF2' : '#fff', color: on ? '#7D1D3F' : '#1C0D14', fontWeight: on ? 600 : 400 }}>
                    {t.serialNumber || '—'}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="What's the issue / requirement?"
            style={{ ...inputStyle, resize: 'none' }} />
        </div>

        <div style={{ ...cardStyle, background: '#FFFBEB', boxShadow: 'none', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
            This notification will be assigned to you. A Service Manager must approve it before you can add expenses.
          </div>
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <button className="mtap" onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: submitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 24 }}>
          {submitting ? 'Creating…' : 'Create Notification'}
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
