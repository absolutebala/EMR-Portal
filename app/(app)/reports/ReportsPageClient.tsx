'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { reportStatusGroup, STATUS_GROUP_META, type ComplaintReportRow, type ReportStatusGroup } from '@/lib/reports'

type TabId = 'all' | ReportStatusGroup
const TAB_IDS: TabId[] = ['all', 'open', 'in_progress', 'closed']
const TAB_LABEL: Record<TabId, string> = { all: 'All', open: 'Open', in_progress: 'In Progress', closed: 'Closed' }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Monday of the week containing d (local time).
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  initialRows: ComplaintReportRow[]
  initialError: string | null
  userName: string
  userRole: string
}

export default function ReportsPageClient({ initialRows, initialError, userName, userRole }: Props) {
  const rows = initialRows
  const [tab, setTab] = useState<TabId>('all')

  // Search + date range apply only when "Search" is clicked (Clear resets both).
  const [searchInput, setSearchInput] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')

  function onSearch() { setAppliedSearch(searchInput.trim()); setAppliedFrom(fromInput); setAppliedTo(toInput); setWeekSel('') }
  function onClear() { setSearchInput(''); setFromInput(''); setToInput(''); setAppliedSearch(''); setAppliedFrom(''); setAppliedTo(''); setWeekSel('') }

  // "Select Week" is a quick way to set the date range (current week + previous 7,
  // Monday–Sunday); picking one fills + applies the From/To filter so the table and the
  // export both scope to it. "All dates" clears the range.
  const weeks = useMemo(() => {
    const out: { from: string; to: string; label: string }[] = []
    const thisMon = startOfWeek(new Date())
    for (let i = 0; i < 8; i++) {
      const mon = new Date(thisMon); mon.setDate(mon.getDate() - 7 * i)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      const range = `${fmtShort(mon)} – ${fmtShort(sun)}`
      out.push({ from: toISO(mon), to: toISO(sun), label: i === 0 ? `This Week: ${range}` : range })
    }
    return out
  }, [])
  const [weekSel, setWeekSel] = useState('')
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  function selectWeek(val: string) {
    setWeekSel(val)
    if (val === '') { setFromInput(''); setToInput(''); setAppliedFrom(''); setAppliedTo('') }
    else { const w = weeks[Number(val)]; if (w) { setFromInput(w.from); setToInput(w.to); setAppliedFrom(w.from); setAppliedTo(w.to) } }
  }
  // Export EVERY row matching the current filters (status tab + search + date range) —
  // all pages — generated server-side so nothing is capped to the visible page.
  function downloadExport(format: 'xlsx' | 'pdf') {
    const params = new URLSearchParams({ format })
    if (tab !== 'all') params.set('tab', tab)
    if (appliedSearch) params.set('search', appliedSearch)
    if (appliedFrom) params.set('from', appliedFrom)
    if (appliedTo) params.set('to', appliedTo)
    window.location.href = `/api/reports/export?${params.toString()}`
    setShowDownloadMenu(false)
  }

  // Search + date filters applied (tab applied separately for per-tab counts).
  const scoped = useMemo(() => rows.filter(r => {
    if (appliedSearch) {
      const hay = `${r.woNumber} ${r.ticketNumber} ${r.customerName} ${r.siteName} ${r.engineerName}`.toLowerCase()
      if (!hay.includes(appliedSearch.toLowerCase())) return false
    }
    if (appliedFrom && (!r.complaintDate || r.complaintDate.slice(0, 10) < appliedFrom)) return false
    if (appliedTo && (!r.complaintDate || r.complaintDate.slice(0, 10) > appliedTo)) return false
    return true
  }), [rows, appliedSearch, appliedFrom, appliedTo])

  const counts = useMemo(() => {
    const c = { all: scoped.length, open: 0, in_progress: 0, closed: 0 }
    scoped.forEach(r => { c[reportStatusGroup(r.status)]++ })
    return c as Record<TabId, number>
  }, [scoped])

  const filtered = useMemo(() => tab === 'all' ? scoped : scoped.filter(r => reportStatusGroup(r.status) === tab), [scoped, tab])
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 8)
  useEffect(() => { setPage(1) }, [tab, appliedSearch, appliedFrom, appliedTo, setPage])

  const inputStyle: React.CSSProperties = { padding: '8px 11px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 12, fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--gm)' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--tx)', borderBottom: '1px solid var(--gl)', verticalAlign: 'top' }

  return (
    <>
      <Topbar title="Reports" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        {/* Status tabs with counts */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TAB_IDS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${tab === t ? 'var(--m)' : 'var(--gm)'}`,
              background: tab === t ? 'var(--m)' : '#fff', color: tab === t ? '#fff' : 'var(--tx)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
            }}>
              {TAB_LABEL[t]} ({counts[t]})
            </button>
          ))}
        </div>

        {/* Weekly download */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: '14px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txm)', marginBottom: 5 }}>Select Week</label>
              <select value={weekSel} onChange={e => selectWeek(e.target.value)} style={{ ...inputStyle, minWidth: 280, cursor: 'pointer' }}>
                <option value="">All dates</option>
                {weeks.map((w, i) => <option key={w.from} value={i}>{w.label}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowDownloadMenu(s => !s)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none',
                background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
              }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download Reports
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {showDownloadMenu && (
                <>
                  <div onClick={() => setShowDownloadMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 11, overflow: 'hidden', minWidth: 210 }}>
                    <button onClick={() => downloadExport('xlsx')} style={menuItem}>Download as Excel (.xlsx)</button>
                    <button onClick={() => downloadExport('pdf')} style={{ ...menuItem, borderTop: '1px solid var(--gl)' }}>Download as PDF (.pdf)</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            Exports every complaint matching the current tab, search and date filters — all pages — with status, customer, site and engineer.
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 260px', minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txm)', marginBottom: 5 }}>Search</label>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
              placeholder="Notification no, customer, site, engineer…" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txm)', marginBottom: 5 }}>From Date</label>
            <input type="date" value={fromInput} onChange={e => setFromInput(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txm)', marginBottom: 5 }}>To Date</label>
            <input type="date" value={toInput} onChange={e => setToInput(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={onSearch} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Search</button>
          <button onClick={onClear} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--gm)', background: '#fff', color: 'var(--tx)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Clear</button>
        </div>

        {initialError && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{initialError}</div>}

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Notification No.</th>
                  <th style={th}>Customer Name</th>
                  <th style={th}>Site</th>
                  <th style={th}>Engineer</th>
                  <th style={th}>Customer Issue</th>
                  <th style={th}>Status</th>
                  <th style={th}>Complaint Date</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--txm)', padding: 36 }}>No reports found.</td></tr>
                ) : pageItems.map((r, i) => {
                  const meta = STATUS_GROUP_META[reportStatusGroup(r.status)]
                  return (
                    <tr key={r.id}>
                      <td style={td}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.woNumber}</td>
                      <td style={td}>{r.customerName}</td>
                      <td style={td}>{r.siteName || '—'}</td>
                      <td style={td}>{r.engineerName}</td>
                      <td style={{ ...td, maxWidth: 260 }}>{r.customerIssue || '—'}</td>
                      <td style={td}><span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</span></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.complaintDate)}</td>
                      <td style={td}><Link href={`/work-orders/${r.id}`} style={{ color: 'var(--m)', fontWeight: 600, textDecoration: 'none', fontSize: 11 }}>View</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPage={setPage} />
        </div>
      </div>
    </>
  )
}

const menuItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff',
  color: 'var(--tx)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
}
