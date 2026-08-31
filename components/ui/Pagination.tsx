'use client'

import { useState } from 'react'

// Client-side pagination over an already-fetched, already-filtered array. The list
// pages all fetch their full dataset and filter/search in-memory, so this just slices
// the current page out of that result — search and filters keep working across the
// whole set, and there's no extra round-trip. `page` is clamped during render (not via
// an effect) so shrinking the list with a filter can never strand the user on an empty
// page past the end.
export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)
  return { page: safePage, setPage, totalPages, pageItems, total, pageSize }
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}

export default function Pagination({ page, totalPages, total, pageSize, onPage }: PaginationProps) {
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff',
    fontSize: 12, fontWeight: 500, fontFamily: 'Poppins, sans-serif',
    color: disabled ? 'var(--txm)' : 'var(--tx)', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--txm)' }}>
        Showing {from}–{to} of {total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={btn(page <= 1)} disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>Page {page} of {totalPages}</span>
        <button style={btn(page >= totalPages)} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next →</button>
      </div>
    </div>
  )
}
