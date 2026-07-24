'use client'

import { useState } from 'react'
import { addContact, updateContact, deleteContact } from '@/app/actions/save-contact'
import type { CustomerContact } from '@/lib/types'

const fi: React.CSSProperties = {
  padding: '6px 9px', border: '1.5px solid var(--mb)', borderRadius: 6,
  fontSize: 12, color: 'var(--tx)', outline: 'none',
  fontFamily: 'Poppins,sans-serif', width: '100%', background: 'var(--mp)',
}

function EditIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  )
}

function iconBtn(danger = false): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6, border: `1px solid ${danger ? '#FCA5A5' : 'var(--gm)'}`,
    background: danger ? '#FEF2F2' : '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

const emptyForm = {
  name: '', designation: '', phone: '', email: '', whatsapp_number: '', address: '', is_primary: false, site_id: '',
}

interface Site { id: string; site_name: string }

interface Props {
  customerId: string
  contacts: CustomerContact[]
  sites: Site[]
  canEdit: boolean
}

export default function ContactsTableClient({ customerId, contacts: init, sites, canEdit }: Props) {
  const [contacts, setContacts] = useState(init)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...emptyForm })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  function startEdit(c: CustomerContact) {
    setEditingId(c.id)
    setEditForm({
      name: c.name, designation: c.designation || '',
      phone: c.phone || '', email: c.email || '',
      whatsapp_number: c.whatsapp_number || '', address: c.address || '', is_primary: c.is_primary,
      site_id: c.site_id || '',
    })
    setError('')
  }

  function efset(k: string, v: string | boolean) { setEditForm(f => ({ ...f, [k]: v })) }
  function afset(k: string, v: string | boolean) { setAddForm(f => ({ ...f, [k]: v })) }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const { error } = await updateContact(id, {
      name: editForm.name,
      designation: editForm.designation || null,
      phone: editForm.phone || null,
      email: editForm.email || null,
      whatsapp_number: editForm.whatsapp_number || null,
      address: editForm.address || null,
      is_primary: editForm.is_primary,
      site_id: editForm.site_id || null,
    }, customerId)
    setSaving(false)
    if (error) { setError(error); return }
    setContacts(cs => cs.map(c => c.id === id ? {
      ...c,
      name: editForm.name,
      designation: editForm.designation || null,
      phone: editForm.phone || null,
      email: editForm.email || null,
      whatsapp_number: editForm.whatsapp_number || null,
      address: editForm.address || null,
      is_primary: editForm.is_primary,
      site_id: editForm.site_id || null,
    } : editForm.is_primary ? { ...c, is_primary: false } : c))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await deleteContact(id)
    setDeleting(null)
    setConfirmDelete(null)
    if (error) { setError(error); return }
    setContacts(cs => cs.filter(c => c.id !== id))
  }

  async function handleAdd() {
    if (!addForm.name.trim()) { setAddError('Name is required'); return }
    setAddSaving(true)
    setAddError('')
    const { error } = await addContact({
      customer_id: customerId,
      site_id: addForm.site_id || null,
      name: addForm.name,
      designation: addForm.designation || null,
      phone: addForm.phone || null,
      email: addForm.email || null,
      whatsapp_number: addForm.whatsapp_number || null,
      address: addForm.address || null,
      is_primary: addForm.is_primary,
    })
    setAddSaving(false)
    if (error) { setAddError(error); return }
    window.location.reload()
  }

  const siteName = (id: string | null) => id ? (sites.find(s => s.id === id)?.site_name || '—') : 'General'

  const COLS = ['Name', 'Site', 'Designation', 'Phone', 'Email', 'Address', 'WhatsApp', ...(canEdit ? [''] : [])]

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Contacts</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--txm)' }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
          {canEdit && (
            <button onClick={() => { setShowAdd(true); setAddForm({ ...emptyForm }); setAddError('') }}
              style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add contact
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '8px 18px', fontSize: 12 }}>{error}</div>}

      {/* Add form */}
      {showAdd && (
        <div style={{ padding: '14px 18px', background: 'var(--mp)', borderBottom: '1px solid var(--mb)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>New contact</div>
          {addError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 7, padding: '7px 10px', fontSize: 12, marginBottom: 10 }}>{addError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Name *</label>
              <input required style={fi} value={addForm.name} onChange={e => afset('name', e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Site</label>
              <select style={fi} value={addForm.site_id as string} onChange={e => afset('site_id', e.target.value)}>
                <option value="">General (no specific site)</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Designation</label>
              <input style={fi} value={addForm.designation as string} onChange={e => afset('designation', e.target.value)} placeholder="e.g. Engineer" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Phone</label>
              <input style={fi} value={addForm.phone as string} onChange={e => { afset('phone', e.target.value); if (!addForm.whatsapp_number) afset('whatsapp_number', e.target.value) }} placeholder="+91 XXXXXXXXXX" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Email</label>
              <input type="email" style={fi} value={addForm.email as string} onChange={e => afset('email', e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Address</label>
              <input style={fi} value={addForm.address as string} onChange={e => afset('address', e.target.value)} placeholder="Contact's address" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>WhatsApp</label>
              <input style={fi} value={addForm.whatsapp_number as string} onChange={e => afset('whatsapp_number', e.target.value)} placeholder="+91 XXXXXXXXXX" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--tx)' }}>
                <input type="checkbox" checked={addForm.is_primary as boolean} onChange={e => afset('is_primary', e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--m)', cursor: 'pointer' }} />
                Set as primary contact
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowAdd(false); setAddError('') }} disabled={addSaving}
              style={{ padding: '6px 13px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={addSaving}
              style={{ padding: '6px 13px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: addSaving ? .7 : 1 }}>
              {addSaving ? 'Saving…' : 'Add contact'}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !showAdd ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No contacts added yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLS.map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => {
              const isEditing = editingId === c.id
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--gm)', background: isEditing ? 'var(--mp)' : undefined }}>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 130 }} value={editForm.name} onChange={e => efset('name', e.target.value)} />
                      : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{c.name}</span>
                          {c.is_primary && (
                            <span style={{ fontSize: 9, fontWeight: 600, background: 'var(--mp)', color: 'var(--m)', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>Primary</span>
                          )}
                        </div>
                      )}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? (
                        <select style={{ ...fi, minWidth: 130 }} value={editForm.site_id} onChange={e => efset('site_id', e.target.value)}>
                          <option value="">General</option>
                          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                        </select>
                      )
                      : <span style={{ fontSize: 12, color: c.site_id ? 'var(--tx)' : 'var(--txm)' }}>{siteName(c.site_id)}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 110 }} value={editForm.designation} onChange={e => efset('designation', e.target.value)} placeholder="e.g. Engineer" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{c.designation || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 120 }} value={editForm.phone} onChange={e => efset('phone', e.target.value)} placeholder="+91 XXXXXXXXXX" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{c.phone || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input type="email" style={{ ...fi, minWidth: 140 }} value={editForm.email} onChange={e => efset('email', e.target.value)} placeholder="email@example.com" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{c.email || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 140 }} value={editForm.address} onChange={e => efset('address', e.target.value)} placeholder="Contact's address" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{c.address || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input style={{ ...fi, minWidth: 120 }} value={editForm.whatsapp_number} onChange={e => efset('whatsapp_number', e.target.value)} placeholder="+91 XXXXXXXXXX" />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tx)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={editForm.is_primary} onChange={e => efset('is_primary', e.target.checked)}
                              style={{ width: 13, height: 13, accentColor: 'var(--m)', cursor: 'pointer' }} />
                            Primary contact
                          </label>
                        </div>
                      )
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{c.whatsapp_number || '—'}</span>}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => saveEdit(c.id)} disabled={saving}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
                            {saving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => { setEditingId(null); setError('') }}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            Cancel
                          </button>
                        </div>
                      ) : confirmDelete === c.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#DC2626' }}>Delete?</span>
                          <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            {deleting === c.id ? '…' : 'Yes'}
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(c)} style={iconBtn()} title="Edit"><EditIcon /></button>
                          <button onClick={() => setConfirmDelete(c.id)} style={iconBtn(true)} title="Delete"><TrashIcon /></button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
