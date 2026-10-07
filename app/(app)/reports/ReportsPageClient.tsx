'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import Pagination, { usePagination } from '@/components/ui/Pagination'
import { reportStatusGroup, STATUS_GROUP_META, type ComplaintReportRow, type ReportStatusGroup } from '@/lib/reports'
import { getRange, type ViewMode } from '../attendance/dateRange'

type TabId = 'all' | ReportStatusGroup
const TAB_IDS: TabId[] = ['all', 'open', 'in_progress', 'closed']
const TAB_LABEL: Record<TabId, string> = { all: 'All', open: 'Open', in_progress: 'In Progress', closed: 'Closed' }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type SortKey = 'complaintNo' | 'notificationNo' | 'customer' | 'site' | 'engineer' | 'issue' | 'status' | 'date'
const STATUS_ORDER: ReportStatusGroup[] = ['open', 'in_progress', 'closed']
function sortVal(r: ComplaintReportRow, k: SortKey): string | number {
  switch (k) {
    case 'complaintNo': return r.ticketNumber || ''
    case 'notificationNo': return r.woNumber || ''
    case 'customer': return r.customerName || ''
    case 'site': return r.siteName || ''
    case 'engineer': return r.engineerName || ''
    case 'issue': return r.customerIssue || ''
    case 'status': return STATUS_ORDER.indexOf(reportStatusGroup(r.status))
    case 'date': return r.complaintDate ? new Date(r.complaintDate).getTime() : 0
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 0, marginLeft: 3 }}>
      <svg width="7" height="4" viewBox="0 0 10 6" style={{ opacity: active && dir === 'asc' ? 1 : 0.3 }}><path d="M5 0l5 6H0z" fill="currentColor" /></svg>
      <svg width="7" height="4" viewBox="0 0 10 6" style={{ opacity: active && dir === 'desc' ? 1 : 0.3, marginTop: 2 }}><path d="M5 6L0 0h10z" fill="currentColor" /></svg>
    </span>
  )
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

  // Period selector (This Week / This Month / Custom + prev-next nav) — drives the date
  // range for both the list and the export, like the Attendance page.
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(new Date())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => getRange(viewMode, anchor, customFrom, customTo), [viewMode, anchor, customFrom, customTo])
  const customInvalid = viewMode === 'custom' && !!customFrom && !!customTo && customFrom > customTo

  function selectMode(m: ViewMode) {
    setViewMode(m)
    if (m !== 'custom') setAnchor(new Date())
    else if (!customFrom) { const r = getRange('week', new Date(), '', ''); setCustomFrom(r.from); setCustomTo(r.to) }
  }
  function shift(delta: number) {
    const a = new Date(anchor)
    if (viewMode === 'week') a.setDate(a.getDate() + delta * 7)
    else if (viewMode === 'month') a.setMonth(a.getMonth() + delta)
    setAnchor(a)
  }

  // Effective date range (empty while a custom range is incomplete/invalid → no date filter).
  const dateFrom = customInvalid ? '' : range.from
  const dateTo = customInvalid ? '' : range.to

  // Search (applied on Search click; Clear resets it).
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  function onSearch() { setAppliedSearch(searchInput.trim()) }
  function onClear() { setSearchInput(''); setAppliedSearch('') }

  // Search + date-range filters (tab applied separately so each tab shows its own count).
  const scoped = useMemo(() => rows.filter(r => {
    if (appliedSearch) {
      const hay = `${r.woNumber} ${r.ticketNumber} ${r.customerName} ${r.siteName} ${r.engineerName}`.toLowerCase()
      if (!hay.includes(appliedSearch.toLowerCase())) return false
    }
    if (dateFrom && (!r.complaintDate || r.complaintDate.slice(0, 10) < dateFrom)) return false
    if (dateTo && (!r.complaintDate || r.complaintDate.slice(0, 10) > dateTo)) return false
    return true
  }), [rows, appliedSearch, dateFrom, dateTo])

  const counts = useMemo(() => {
    const c = { all: scoped.length, open: 0, in_progress: 0, closed: 0 }
    scoped.forEach(r => { c[reportStatusGroup(r.status)]++ })
    return c as Record<TabId, number>
  }, [scoped])

  const filtered = useMemo(() => tab === 'all' ? scoped : scoped.filter(r => reportStatusGroup(r.status) === tab), [scoped, tab])

  // Click-to-sort on any column (asc first, then toggles to desc).
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey)
      let c: number
      if (typeof av === 'number' && typeof bv === 'number') c = av - bv
      else { const as = String(av).toLowerCase(), bs = String(bv).toLowerCase(); c = as < bs ? -1 : as > bs ? 1 : 0 }
      return sortDir === 'asc' ? c : -c
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(sorted, 8)
  useEffect(() => { setPage(1) }, [tab, appliedSearch, dateFrom, dateTo, sortKey, sortDir, setPage])

  // Export EVERY row matching the current list (status tab + search + date range) — all
  // pages — generated server-side so nothing is capped to the visible page.
  function downloadExport(format: 'xlsx' | 'pdf') {
    const params = new URLSearchParams({ format })
    if (tab !== 'all') params.set('tab', tab)
    if (appliedSearch) params.set('search', appliedSearch)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    window.location.href = `/api/reports/export?${params.toString()}`
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? 'var(--m)' : 'var(--gm)'}`,
    background: active ? 'var(--m)' : '#fff', color: active ? '#fff' : 'var(--tx)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
  })
  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const dateInput: React.CSSProperties = { padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }
  const exportBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--m)', background: '#fff', color: 'var(--m)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--gm)' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--tx)', borderBottom: '1px solid var(--gl)', verticalAlign: 'top' }

  return (
    <>
      <Topbar title="Reports" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        {/* Period selector (top) */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(viewMode === 'week')} onClick={() => selectMode('week')}>This Week</button>
            <button style={tabStyle(viewMode === 'month')} onClick={() => selectMode('month')}>This Month</button>
            <button style={tabStyle(viewMode === 'custom')} onClick={() => selectMode('custom')}>Custom</button>
          </div>
          {viewMode !== 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => shift(-1)} aria-label="Previous" style={navBtn}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 170, textAlign: 'center' }}>{range.label}</span>
              <button onClick={() => shift(1)} aria-label="Next" style={navBtn}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={dateInput} />
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={dateInput} />
              {customInvalid && <span style={{ fontSize: 11, color: '#DC2626' }}>Pick a valid range (From must be on or before To).</span>}
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 300px', minWidth: 220 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
              placeholder="Search by notification no, customer, site, engineer…" style={{ padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 8, fontSize: 12, fontFamily: 'Poppins,sans-serif', width: '100%', boxSizing: 'border-box' }} />
          </div>
          <button onClick={onSearch} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--m)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Search</button>
          <button onClick={onClear} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid var(--gm)', background: '#fff', color: 'var(--tx)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Clear</button>
        </div>

        {/* Status tabs (with counts) + per-list export buttons on the right */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {TAB_IDS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>{TAB_LABEL[t]} ({counts[t]})</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => downloadExport('pdf')} style={exportBtn} title="Download the current list as PDF (all pages)">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export PDF
            </button>
            <button onClick={() => downloadExport('xlsx')} style={exportBtn} title="Download the current list as Excel (all pages)">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export Excel
            </button>
          </div>
        </div>

        {initialError && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{initialError}</div>}

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  {([
                    ['complaintNo', 'Complaint No.'],
                    ['notificationNo', 'Notification No.'],
                    ['customer', 'Customer Name'],
                    ['site', 'Site'],
                    ['engineer', 'Engineer'],
                    ['issue', 'Customer Issue'],
                    ['status', 'Status'],
                    ['date', 'Complaint Date'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{label}<SortIcon active={sortKey === key} dir={sortDir} /></span>
                    </th>
                  ))}
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--txm)', padding: 36 }}>No reports found.</td></tr>
                ) : pageItems.map((r, i) => {
                  const meta = STATUS_GROUP_META[reportStatusGroup(r.status)]
                  return (
                    <tr key={r.id}>
                      <td style={td}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.ticketNumber || '—'}</td>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.woNumber}</td>
                      <td style={td}>{r.customerName}</td>
                      <td style={td}>{r.siteName || '—'}</td>
                      <td style={td}>{r.engineerName}</td>
                      <td style={{ ...td, maxWidth: 260 }}>{r.customerIssue || '—'}</td>
                      <td style={td}><span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</span></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.complaintDate)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <Link href={`/work-orders/${r.id}`} style={{ color: 'var(--m)', fontWeight: 600, textDecoration: 'none', fontSize: 11 }}>View</Link>
                        <a href={`/api/reports/complaint/${r.id}?format=pdf`} title="Download this complaint's detailed report" style={{ color: 'var(--m)', fontWeight: 600, textDecoration: 'none', fontSize: 11, marginLeft: 12 }}>PDF</a>
                      </td>
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
