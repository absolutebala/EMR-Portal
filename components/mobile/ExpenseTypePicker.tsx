'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getExpenseTypes, getOrCreateExpenseType, type ExpenseType } from '@/app/actions/expenses'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10,
  fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif',
  background: '#fff', boxSizing: 'border-box',
}

interface Props {
  valueId: string
  valueName: string
  onChange: (id: string, name: string) => void
}

// Searchable + creatable dropdown over the expense_types catalog — same pattern
// as CustomerCategoryPicker, mobile-styled.
export default function ExpenseTypePicker({ valueId, valueName, onChange }: Props) {
  const [query, setQuery] = useState(valueName)
  const [types, setTypes] = useState<ExpenseType[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { types: data } = await getExpenseTypes()
    setTypes(data)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q ? types.filter(t => t.name.toLowerCase().includes(q)) : types
  const exactMatch = types.some(t => t.name.toLowerCase() === q)

  function selectType(t: ExpenseType) {
    setQuery(t.name)
    onChange(t.id, t.name)
    setOpen(false)
  }

  async function createNew() {
    if (!query.trim()) return
    setCreating(true)
    const { type, error } = await getOrCreateExpenseType(query.trim())
    setCreating(false)
    if (error || !type) return
    setTypes(prev => (prev.some(t => t.id === type.id) ? prev : [...prev, type].sort((a, b) => a.name.localeCompare(b.name))))
    selectType(type)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange('', e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? 'Loading…' : 'Search or type to add…'}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E5E0E3', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 200, overflow: 'hidden', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
          {filtered.map(t => (
            <div key={t.id} className="mtap" onClick={() => selectType(t)}
              style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F5F3F5', fontSize: 12, color: '#1C0D14', fontWeight: t.id === valueId ? 600 : 400, background: t.id === valueId ? '#F9EEF2' : 'transparent' }}>
              {t.name}
            </div>
          ))}
          {filtered.length === 0 && !q && !loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#7A6870' }}>No expense types yet — type to add one.</div>
          )}
          {q && !exactMatch && (
            <div className="mtap" onClick={createNew}
              style={{ padding: '10px 12px', cursor: creating ? 'not-allowed' : 'pointer', fontSize: 12, color: '#7D1D3F', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {creating ? 'Adding…' : `Add "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
