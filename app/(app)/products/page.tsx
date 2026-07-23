'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { getProductsCatalog, createProduct, updateProduct, deleteProduct, type Product } from '@/app/actions/products'

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [name, setName] = useState('')
  const [sapCode, setSapCode] = useState('')
  const [stockQty, setStockQty] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { products: data } = await getProductsCatalog()
    setProducts(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
  }, [load, supabase])

  function openAdd() {
    setEditing(null)
    setName(''); setSapCode(''); setStockQty('0'); setError('')
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setName(p.name); setSapCode(p.sap_code || ''); setStockQty(String(p.stock_qty)); setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) { setError('Product name is required'); return }
    setSaving(true)
    setError('')
    const payload = { name: name.trim(), sapCode: sapCode.trim() || null, stockQty: parseInt(stockQty, 10) || 0 }
    const result = editing ? await updateProduct(editing.id, payload) : await createProduct(payload)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    setModalOpen(false)
    load()
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Remove "${p.name}" from the catalog?`)) return
    await deleteProduct(p.id)
    load()
  }

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || (p.sap_code || '').toLowerCase().includes(q)
  })

  return (
    <>
      <Topbar title="Products" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px', flex: 1, maxWidth: 320 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SAP code…" style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: '100%' }} />
          </div>
          <button onClick={openAdd} style={{ marginLeft: 'auto', background: 'var(--m)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
            + Add Product
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading products…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>
              {products.length === 0 ? 'No products yet. Click "Add Product" to build the catalog.' : 'No products match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'SAP Code', 'Stock', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{p.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{p.sap_code || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 600,
                        background: p.stock_qty === 0 ? '#FEE2E2' : p.stock_qty <= 3 ? '#FEF3C7' : '#D1FAE5',
                        color: p.stock_qty === 0 ? '#991B1B' : p.stock_qty <= 3 ? '#92400E' : '#065F46',
                      }}>
                        {p.stock_qty === 0 ? 'Out of stock' : `${p.stock_qty} in stock`}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(p)} style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: 'var(--m)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Edit</button>
                      <button onClick={() => handleDelete(p)} style={{ background: '#FEE2E2', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: '#991B1B', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'Add Product'}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Product name <span style={{ color: 'var(--m)' }}>*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Oil Surge Relay" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>SAP code</label>
          <input value={sapCode} onChange={e => setSapCode(e.target.value)} style={inputStyle} placeholder="e.g. 1000234" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Stock quantity</label>
          <input type="number" min="0" value={stockQty} onChange={e => setStockQty(e.target.value)} style={inputStyle} />
        </div>
        {error && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 7, padding: '8px 10px', fontSize: 11, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: saving ? '#A8294F' : 'var(--m)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins,sans-serif' }}
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
        </button>
      </Modal>
    </>
  )
}
