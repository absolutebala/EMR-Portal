'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getCustomerCategories, getOrCreateCustomerCategory, type CustomerCategory, type CustomerCategoryType } from '@/app/actions/customer-categories'

const fi2: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }

interface Props {
  customerType: CustomerCategoryType
  valueId: string
  valueName: string
  onChange: (id: string, name: string) => void
}

// Searchable + creatable dropdown: type to filter the existing catalog for this
// customer type, or add a brand new category inline if nothing matches.
export default function CustomerCategoryPicker({ customerType, valueId, valueName, onChange }: Props) {
  const [query, setQuery] = useState(valueName)
  const [categories, setCategories] = useState<CustomerCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { categories: data } = await getCustomerCategories(customerType)
    setCategories(data)
    setLoading(false)
  }, [customerType])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(valueName)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerType])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q ? categories.filter(c => c.name.toLowerCase().includes(q)) : categories
  const exactMatch = categories.some(c => c.name.toLowerCase() === q)

  function selectCategory(c: CustomerCategory) {
    setQuery(c.name)
    onChange(c.id, c.name)
    setOpen(false)
  }

  async function createNew() {
    if (!query.trim()) return
    setCreating(true)
    const { category, error } = await getOrCreateCustomerCategory(customerType, query.trim())
    setCreating(false)
    if (error || !category) return
    setCategories(prev => (prev.some(c => c.id === category.id) ? prev : [...prev, category].sort((a, b) => a.name.localeCompare(b.name))))
    selectCategory(category)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={fi2}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange('', e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={loading ? 'Loading…' : 'Search or type to add…'}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 200, overflow: 'hidden', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => selectCategory(c)}
              style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gm)', fontSize: 12, color: 'var(--tx)', fontWeight: c.id === valueId ? 600 : 400, background: c.id === valueId ? 'var(--mp)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--mp)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = c.id === valueId ? 'var(--mp)' : ''}>
              {c.name}
            </div>
          ))}
          {filtered.length === 0 && !q && !loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--txm)' }}>No categories yet — type to add one.</div>
          )}
          {q && !exactMatch && (
            <div onClick={createNew}
              style={{ padding: '9px 12px', cursor: creating ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--m)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--mp)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {creating ? 'Adding…' : `Add "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
