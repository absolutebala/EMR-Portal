'use client'

import { useState, useCallback } from 'react'
import { addTransformer, updateTransformer, deleteTransformer } from '@/app/actions/save-transformer'
import type { Customer, CustomerSite, Transformer } from '@/lib/types'

const fi: React.CSSProperties = {
  padding: '6px 9px', border: '1.5px solid var(--mb)', borderRadius: 6,
  fontSize: 12, color: 'var(--tx)', outline: 'none',
  fontFamily: 'Poppins,sans-serif', width: '100%', background: 'var(--mp)',
}
const sel: React.CSSProperties = { ...fi }

const warrantyLabels: Record<string, { label: string; bg: string; color: string }> = {
  under_warranty: { label: 'Under warranty', bg: '#D1FAE5', color: '#065F46' },
  expired: { label: 'Expired', bg: '#FEE2E2', color: '#991B1B' },
  amc: { label: 'AMC', bg: '#DBEAFE', color: '#1E40AF' },
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

interface Props {
  customer: Customer
  sites: CustomerSite[]
  transformers: Transformer[]
  canEdit: boolean
}

export default function TransformerTableClient({ customer, sites: initSites, transformers: initTx, canEdit }: Props) {
  const [sites, setSites] = useState(initSites)
  const [transformers, setTransformers] = useState(initTx)

  // ── Row editing ──────────────────────────────────────────────────────────
  const [txEditing, setTxEditing] = useState<string | null>(null)
  const [txForm, setTxForm] = useState<Record<string, string>>({})
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')
  const [txConfirmDelete, setTxConfirmDelete] = useState<string | null>(null)
  const [txDeleting, setTxDeleting] = useState<string | null>(null)

  function startEdit(t: Transformer) {
    setTxEditing(t.id)
    setTxForm({
      serial_number: t.serial_number,
      rating: t.rating || '',
      manufacturer: t.manufacturer || '',
      year_of_manufacture: t.year_of_manufacture || '',
      warranty_status: t.warranty_status,
      site_id: t.site_id || '',
    })
    setTxError('')
  }

  function tfset(k: string, v: string) { setTxForm(f => ({ ...f, [k]: v })) }

  async function saveTx(id: string) {
    if (!txForm.serial_number.trim()) { setTxError('Serial number is required'); return }
    setTxSaving(true)
    setTxError('')
    const { error } = await updateTransformer(id, {
      serial_number: txForm.serial_number,
      rating: txForm.rating || null,
      manufacturer: txForm.manufacturer || null,
      year_of_manufacture: txForm.year_of_manufacture || null,
      warranty_status: txForm.warranty_status,
      site_id: txForm.site_id || null,
    })
    setTxSaving(false)
    if (error) { setTxError(error); return }
    setTransformers(ts => ts.map(t => t.id === id ? {
      ...t,
      serial_number: txForm.serial_number,
      rating: txForm.rating || null,
      manufacturer: txForm.manufacturer || null,
      year_of_manufacture: txForm.year_of_manufacture || null,
      warranty_status: txForm.warranty_status as Transformer['warranty_status'],
      site_id: txForm.site_id || null,
    } : t))
    setTxEditing(null)
  }

  async function handleDelete(id: string) {
    setTxDeleting(id)
    const { error } = await deleteTransformer(id)
    setTxDeleting(null)
    setTxConfirmDelete(null)
    if (error) { setTxError(error); return }
    setTransformers(ts => ts.filter(t => t.id !== id))
  }

  // ── Add row ──────────────────────────────────────────────────────────────
  const emptyAdd = useCallback(() => ({
    site_id: initSites[0]?.id || '',
    new_site_name: '', new_site_address: '',
    serial_number: '', rating: '', manufacturer: '',
    year_of_manufacture: '', warranty_status: 'under_warranty',
  }), [initSites])

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState(emptyAdd)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  function aset(k: string, v: string) { setAddForm(f => ({ ...f, [k]: v })) }
  const isNewSite = addForm.site_id === '__new__'

  async function handleAdd() {
    if (!addForm.serial_number.trim()) { setAddError('Serial number is required'); return }
    if (isNewSite && !addForm.new_site_address.trim()) { setAddError('Project address is required for new project'); return }
    setAddSaving(true)
    setAddError('')
    const { error } = await addTransformer({
      customer_id: customer.id,
      site_id: isNewSite ? null : (addForm.site_id || null),
      new_site_name: isNewSite ? addForm.new_site_name : undefined,
      new_site_address: isNewSite ? addForm.new_site_address : undefined,
      serial_number: addForm.serial_number,
      rating: addForm.rating || null,
      manufacturer: addForm.manufacturer || null,
      year_of_manufacture: addForm.year_of_manufacture || null,
      warranty_status: addForm.warranty_status,
    })
    setAddSaving(false)
    if (error) { setAddError(error); return }
    window.location.reload()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Transformer / serial numbers</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--txm)' }}>{transformers.length} registered</span>
          {canEdit && (
            <button onClick={() => { setShowAdd(true); setAddForm(emptyAdd()); setAddError('') }}
              style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add serial number
            </button>
          )}
        </div>
      </div>

      {txError && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '8px 18px', fontSize: 12 }}>{txError}</div>}

      {/* Add row form */}
      {showAdd && (
        <div style={{ padding: '14px 18px', background: 'var(--mp)', borderBottom: '1px solid var(--mb)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--m)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>New transformer</div>
          {addError && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 7, padding: '7px 10px', fontSize: 12, marginBottom: 10 }}>{addError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Serial number *</label>
              <input required style={fi} value={addForm.serial_number} onChange={e => aset('serial_number', e.target.value)} placeholder="SN-TR-XXXXX" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Rating</label>
              <input style={fi} value={addForm.rating} onChange={e => aset('rating', e.target.value)} placeholder="e.g. 100 KVA" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Manufacturer</label>
              <input style={fi} value={addForm.manufacturer} onChange={e => aset('manufacturer', e.target.value)} placeholder="e.g. Siemens" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Year of manufacture</label>
              <input style={fi} value={addForm.year_of_manufacture} onChange={e => aset('year_of_manufacture', e.target.value)} placeholder="e.g. 2019" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Warranty status</label>
              <select style={sel} value={addForm.warranty_status} onChange={e => aset('warranty_status', e.target.value)}>
                <option value="under_warranty">Under warranty</option>
                <option value="expired">Warranty expired</option>
                <option value="amc">AMC</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>Project</label>
              <select style={sel} value={addForm.site_id} onChange={e => aset('site_id', e.target.value)}>
                {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                <option value="__new__">+ New project</option>
              </select>
            </div>
            {isNewSite && (
              <>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>New project name</label>
                  <input style={fi} value={addForm.new_site_name} onChange={e => aset('new_site_name', e.target.value)} placeholder="Project / branch name" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>New project address *</label>
                  <input required style={fi} value={addForm.new_site_address} onChange={e => aset('new_site_address', e.target.value)} placeholder="Full project address" />
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowAdd(false); setAddError('') }} disabled={addSaving}
              style={{ padding: '6px 13px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={addSaving}
              style={{ padding: '6px 13px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: addSaving ? .7 : 1 }}>
              {addSaving ? 'Saving…' : 'Add transformer'}
            </button>
          </div>
        </div>
      )}

      {transformers.length === 0 && !showAdd ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--txm)', fontSize: 12 }}>No transformers registered yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Serial number', 'Rating', 'Manufacturer', 'Year', 'Warranty', 'Project', ...(canEdit ? [''] : [])].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transformers.map(t => {
              const ws = warrantyLabels[t.warranty_status] || { label: t.warranty_status, bg: 'var(--gl)', color: 'var(--txm)' }
              const site = sites.find(s => s.id === t.site_id)
              const isEditing = txEditing === t.id

              return (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--gm)', background: isEditing ? 'var(--mp)' : undefined }}>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 120 }} value={txForm.serial_number} onChange={e => tfset('serial_number', e.target.value)} />
                      : <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--m)' }}>{t.serial_number}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 80 }} value={txForm.rating} onChange={e => tfset('rating', e.target.value)} placeholder="100 KVA" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{t.rating || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, minWidth: 100 }} value={txForm.manufacturer} onChange={e => tfset('manufacturer', e.target.value)} placeholder="Siemens" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{t.manufacturer || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <input style={{ ...fi, width: 70 }} value={txForm.year_of_manufacture} onChange={e => tfset('year_of_manufacture', e.target.value)} placeholder="2019" />
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{t.year_of_manufacture || '—'}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <select style={{ ...sel, minWidth: 130 }} value={txForm.warranty_status} onChange={e => tfset('warranty_status', e.target.value)}>
                          <option value="under_warranty">Under warranty</option>
                          <option value="expired">Warranty expired</option>
                          <option value="amc">AMC</option>
                        </select>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: ws.bg, color: ws.color }}>{ws.label}</span>}
                  </td>
                  <td style={{ padding: isEditing ? '8px 10px' : '10px 14px' }}>
                    {isEditing
                      ? <select style={{ ...sel, minWidth: 120 }} value={txForm.site_id} onChange={e => tfset('site_id', e.target.value)}>
                          <option value="">— No project —</option>
                          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                        </select>
                      : <span style={{ fontSize: 12, color: 'var(--txm)' }}>{site?.site_name || '—'}</span>}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => saveTx(t.id)} disabled={txSaving}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: txSaving ? .7 : 1 }}>
                            {txSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => { setTxEditing(null); setTxError('') }}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            Cancel
                          </button>
                        </div>
                      ) : txConfirmDelete === t.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#DC2626' }}>Delete?</span>
                          <button onClick={() => handleDelete(t.id)} disabled={txDeleting === t.id}
                            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            {txDeleting === t.id ? '…' : 'Yes'}
                          </button>
                          <button onClick={() => setTxConfirmDelete(null)}
                            style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(t)} style={iconBtn()} title="Edit"><EditIcon /></button>
                          <button onClick={() => setTxConfirmDelete(t.id)} style={iconBtn(true)} title="Delete"><TrashIcon /></button>
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
