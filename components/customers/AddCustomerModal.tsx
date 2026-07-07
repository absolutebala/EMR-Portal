'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '@/components/ui/Modal'
import { addCustomer, updateCustomer } from '@/app/actions/save-customer'
import type { Customer } from '@/lib/types'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }
const fl2: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editCustomer?: Customer | null
}

export default function AddCustomerModal({ open, onClose, onSaved, editCustomer }: Props) {
  const [form, setForm] = useState({
    name: '', type: 'both', contact_person: '', phone: '', email: '',
    whatsapp_number: '', site_name: '', site_address: '',
    serial_number: '', year_of_manufacture: '', warranty_status: 'under_warranty',
  })
  const whatsappTouched = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    whatsappTouched.current = false
    if (editCustomer) {
      setForm(f => ({
        ...f,
        name: editCustomer.name,
        type: editCustomer.type,
        contact_person: editCustomer.contact_person,
        phone: editCustomer.phone,
        email: editCustomer.email || '',
        whatsapp_number: editCustomer.whatsapp_number || '',
        site_name: '', site_address: '',
        serial_number: '', year_of_manufacture: '', warranty_status: 'under_warranty',
      }))
    } else {
      setForm({ name: '', type: 'both', contact_person: '', phone: '', email: '', whatsapp_number: '', site_name: '', site_address: '', serial_number: '', year_of_manufacture: '', warranty_status: 'under_warranty' })
    }
  }, [editCustomer, open])

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handlePhoneChange(v: string) {
    setForm(f => ({
      ...f,
      phone: v,
      whatsapp_number: whatsappTouched.current ? f.whatsapp_number : v,
    }))
  }

  function handleWhatsappChange(v: string) {
    whatsappTouched.current = true
    set('whatsapp_number', v)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (editCustomer) {
        const { error } = await updateCustomer(editCustomer.id, {
          name: form.name, type: form.type,
          contact_person: form.contact_person, phone: form.phone,
          email: form.email || null, whatsapp_number: form.whatsapp_number || null,
        })
        if (error) throw new Error(error)
      } else {
        const { error } = await addCustomer({
          name: form.name, type: form.type,
          contact_person: form.contact_person, phone: form.phone,
          email: form.email || null, whatsapp_number: form.whatsapp_number || null,
          serial_number: form.serial_number,
          year_of_manufacture: form.year_of_manufacture || null,
          warranty_status: form.warranty_status,
          site_name: form.site_name,
          site_address: form.site_address,
        })
        if (error) throw new Error(error)
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!editCustomer

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit customer' : 'Add customer'} size="lg"
      footer={
        <>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button form="cust-form" type="submit" disabled={loading} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: loading ? .7 : 1 }}>
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
      <form id="cust-form" onSubmit={handleSubmit}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Customer details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>Organisation name <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Customer organisation name" />
          </div>

          {!isEdit && (
            <>
              <div>
                <label style={fl2}>Serial number <span style={{ color: 'var(--m)' }}>*</span></label>
                <input required style={fi2} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} placeholder="SN-TR-XXXXX" />
              </div>
              <div>
                <label style={fl2}>Year of manufacture</label>
                <input style={fi2} value={form.year_of_manufacture} onChange={e => set('year_of_manufacture', e.target.value)} placeholder="e.g. 2019" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fl2}>Warranty status</label>
                <select style={fi2} value={form.warranty_status} onChange={e => set('warranty_status', e.target.value)}>
                  <option value="under_warranty">Under warranty</option>
                  <option value="expired">Warranty expired</option>
                  <option value="amc">AMC</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label style={fl2}>Customer type</label>
            <select style={fi2} value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="sold">Sold customer</option>
              <option value="shipped">Shipped customer</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label style={fl2}>Contact person <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="Primary contact name" />
          </div>
          <div>
            <label style={fl2}>Phone <span style={{ color: 'var(--m)' }}>*</span></label>
            <input required style={fi2} value={form.phone} onChange={e => handlePhoneChange(e.target.value)} placeholder="+91 XXXXXXXXXX" />
          </div>
          <div>
            <label style={fl2}>Email</label>
            <input type="email" style={fi2} value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@customer.com" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fl2}>WhatsApp number</label>
            <input style={fi2} value={form.whatsapp_number} onChange={e => handleWhatsappChange(e.target.value)} placeholder="For notifications" />
          </div>
        </div>

        {!isEdit && (
          <>
            <div style={{ height: 1, background: 'var(--gm)', margin: '0 0 14px' }}/>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Site details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={fl2}>Site name</label>
                <input style={fi2} value={form.site_name} onChange={e => set('site_name', e.target.value)} placeholder="Site / branch name" />
              </div>
              <div>
                <label style={fl2}>Site address <span style={{ color: 'var(--m)' }}>*</span></label>
                <input required style={fi2} value={form.site_address} onChange={e => set('site_address', e.target.value)} placeholder="Full site address" />
              </div>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
