'use client'

import { useState } from 'react'
import { CustomerTypeBadge } from '@/components/ui/Badge'
import { updateCustomer } from '@/app/actions/save-customer'
import type { Customer } from '@/lib/types'

const fi: React.CSSProperties = {
  padding: '6px 9px', border: '1.5px solid var(--mb)', borderRadius: 6,
  fontSize: 12, color: 'var(--tx)', outline: 'none',
  fontFamily: 'Poppins,sans-serif', width: '100%', background: 'var(--mp)',
}
const sel: React.CSSProperties = { ...fi }

interface Props {
  customer: Customer
  canEdit: boolean
}

function EditIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>
    </svg>
  )
}

export default function CustomerInfoClient({ customer: init, canEdit }: Props) {
  const [customer, setCustomer] = useState(init)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: customer.name, type: customer.type,
    contact_person: customer.contact_person, designation: customer.designation || '',
    phone: customer.phone, email: customer.email || '',
    whatsapp_number: customer.whatsapp_number || '',
    sap_customer_code: customer.sap_customer_code || '',
    address: customer.address || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function fset(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setSaving(true)
    setError('')
    const { error } = await updateCustomer(customer.id, {
      name: form.name, type: form.type,
      contact_person: form.contact_person, phone: form.phone,
      email: form.email || null, whatsapp_number: form.whatsapp_number || null,
      address: form.address || null,
    })
    setSaving(false)
    if (error) { setError(error); return }
    setCustomer(c => ({
      ...c, name: form.name, type: form.type as Customer['type'],
      contact_person: form.contact_person, phone: form.phone,
      email: form.email || null, whatsapp_number: form.whatsapp_number || null,
      designation: form.designation || null,
      sap_customer_code: form.sap_customer_code || null,
      address: form.address || null,
    }))
    setEditing(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {customer.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>{customer.name}</div>
          <CustomerTypeBadge type={customer.type} />
        </div>
        {canEdit && !editing && (
          <button onClick={() => { setEditing(true); setError('') }}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <EditIcon />
          </button>
        )}
      </div>

      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 7, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Organisation name *</label>
              <input required style={fi} value={form.name} onChange={e => fset('name', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Customer type</label>
              <select style={sel} value={form.type} onChange={e => fset('type', e.target.value)}>
                <option value="sold">Sold</option>
                <option value="shipped">Shipped</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Contact person *</label>
              <input required style={fi} value={form.contact_person} onChange={e => fset('contact_person', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Designation</label>
              <input style={fi} value={form.designation} onChange={e => fset('designation', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Phone *</label>
              <input required style={fi} value={form.phone} onChange={e => fset('phone', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Email</label>
              <input type="email" style={fi} value={form.email} onChange={e => fset('email', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Address</label>
              <input style={fi} value={form.address} onChange={e => fset('address', e.target.value)} placeholder="Customer's business address" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>WhatsApp</label>
              <input style={fi} value={form.whatsapp_number} onChange={e => fset('whatsapp_number', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>SAP code</label>
              <input style={fi} value={form.sap_customer_code} onChange={e => fset('sap_customer_code', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setEditing(false); setError('') }} disabled={saving}
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {[
            ['Contact person', customer.contact_person],
            ['Designation', customer.designation || '—'],
            ['Phone', customer.phone],
            ['Email', customer.email || '—'],
            ['Address', customer.address || '—'],
            ['WhatsApp', customer.whatsapp_number || '—'],
            ['SAP code', customer.sap_customer_code || '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gm)', fontSize: 12 }}>
              <span style={{ color: 'var(--txm)' }}>{label}</span>
              <span style={{ fontWeight: 500, color: 'var(--tx)' }}>{value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
