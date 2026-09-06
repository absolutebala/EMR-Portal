'use client'

import { useState, useRef, useEffect } from 'react'

interface Eng { id: string; first_name: string; last_name: string }

// Type-to-search engineer picker used by the New Notification modal and the notification
// edit form. Replaces a plain <select> so admins can filter a long engineer list by name.
// Falls back to "Unnamed engineer" when both name parts are blank so such a row is still
// visible and selectable (rather than rendering as an empty option).
export default function EngineerSearchSelect({ engineers, value, onChange, inputStyle, placeholder = 'Search engineer by name…' }: {
  engineers: Eng[]
  value: string
  onChange: (id: string) => void
  inputStyle: React.CSSProperties
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const name = (e: Eng) => `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unnamed engineer'
  const selected = engineers.find(e => e.id === value)
  const q = query.trim().toLowerCase()
  const matches = q ? engineers.filter(e => name(e).toLowerCase().includes(q)) : engineers

  const optStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none',
    borderBottom: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  }

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        value={open ? query : (selected ? name(selected) : '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 14px rgba(0,0,0,0.10)' }}>
          <button type="button" onMouseDown={ev => { ev.preventDefault(); pick('') }} style={{ ...optStyle, color: 'var(--txm)' }}>Unassigned</button>
          {matches.map(e => (
            <button type="button" key={e.id} onMouseDown={ev => { ev.preventDefault(); pick(e.id) }} style={optStyle}>{name(e)}</button>
          ))}
          {matches.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--txm)' }}>No engineer found.</div>}
        </div>
      )}
    </div>
  )
}
