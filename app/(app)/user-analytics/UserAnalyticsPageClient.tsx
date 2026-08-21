'use client'

import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import { getUserAnalyticsOverview, getUserAnalyticsDrilldown, type EngineerAnalyticsRow, type AnalyticsMetric, type AnalyticsDrilldownRow } from '@/app/actions/user-analytics'

interface Props {
  canView: boolean
  initialMonth: string
  initialRows: EngineerAnalyticsRow[]
  initialError: string | null
  userName: string
  userRole: string
}

const METRIC_LABEL: Record<AnalyticsMetric, string> = {
  assigned: 'Assigned', resolved: 'Resolved', reassigned: 'Reassigned',
  expenses: 'Expenses', present: 'Attendance', leave: 'Leave',
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const cellStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--tx)' }
const metricBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--m)',
  cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2,
}

export default function UserAnalyticsPageClient({ canView, initialMonth, initialRows, initialError, userName, userRole }: Props) {
  const [month, setMonth] = useState(initialMonth)
  const [rows, setRows] = useState(initialRows)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const [drilldown, setDrilldown] = useState<{ open: boolean; engineerName: string; metric: AnalyticsMetric | null; loading: boolean; rows: AnalyticsDrilldownRow[] }>({
    open: false, engineerName: '', metric: null, loading: false, rows: [],
  })

  async function loadMonth(newMonth: string) {
    setMonth(newMonth)
    setLoading(true)
    const { rows: r, error: err } = await getUserAnalyticsOverview(newMonth)
    setRows(r)
    setError(err)
    setLoading(false)
  }

  async function openDrilldown(engineerId: string, engineerName: string, metric: AnalyticsMetric) {
    setDrilldown({ open: true, engineerName, metric, loading: true, rows: [] })
    const { rows: r } = await getUserAnalyticsDrilldown(engineerId, month, metric)
    setDrilldown(d => ({ ...d, loading: false, rows: r }))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q))
  }, [rows, search])

  function handleExport() {
    setExporting(true)
    const headers = ['Name', 'Employee ID', 'Assigned', 'Resolved', 'Reassigned', 'Expenses (₹)', 'Attendance', 'Leave']
    const aoa: (string | number)[][] = [headers]
    for (const r of filtered) aoa.push([r.name, r.employeeId, r.assigned, r.resolved, r.reassigned, r.expenseTotal, r.present, r.leave])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'User Analytics')
    XLSX.writeFile(wb, `user_analytics_${month}.xlsx`)
    setExporting(false)
  }

  if (!canView) {
    return (
      <>
        <Topbar title="User Analytics" userName={userName} userRole={userRole} />
        <div style={{ padding: 24, fontSize: 13, color: 'var(--txm)' }}>You don&apos;t have access to this page.</div>
      </>
    )
  }

  return (
    <>
      <Topbar title="User Analytics" subtitle={monthLabel(month)} userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Month-wise scorecard per Field Engineer. Click any number to see the underlying records.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="month"
              value={month}
              onChange={e => e.target.value && loadMonth(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }}
            />
            <input
              type="text"
              placeholder="Search by name or employee ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', width: 220 }}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || !filtered.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--m)', background: '#fff', color: 'var(--m)', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: exporting || !filtered.length ? 0.7 : 1 }}
          >
            Export to Excel
          </button>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--gm)', borderRadius: 10, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFAFA', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Engineer', 'Assigned', 'Resolved', 'Reassigned', 'Expenses', 'Attendance', 'Leave'].map(h => (
                  <th key={h} style={{ ...cellStyle, textAlign: h === 'Engineer' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .4, borderBottom: '1px solid var(--gm)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', padding: 24 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: 'center', padding: 24, color: 'var(--txm)' }}>No field engineers found.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--gm)' }}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--txm)' }}>{r.employeeId}</div>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'assigned')}>{r.assigned}</button>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'resolved')}>{r.resolved}</button>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'reassigned')}>{r.reassigned}</button>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'expenses')}>₹{r.expenseTotal.toLocaleString('en-IN')}</button>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'present')}>{r.present}</button>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <button style={metricBtn} onClick={() => openDrilldown(r.id, r.name, 'leave')}>{r.leave}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={drilldown.open}
        onClose={() => setDrilldown(d => ({ ...d, open: false }))}
        title={drilldown.metric ? `${drilldown.engineerName} — ${METRIC_LABEL[drilldown.metric]} (${monthLabel(month)})` : ''}
        size="lg"
      >
        {drilldown.loading ? (
          <div style={{ fontSize: 12, color: 'var(--txm)', padding: '12px 0' }}>Loading…</div>
        ) : drilldown.rows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--txm)', padding: '12px 0' }}>No records for this month.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {drilldown.metric === 'expenses' ? (
                  <>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Notification</th>
                    <th style={{ ...cellStyle, textAlign: 'right', fontSize: 10, color: 'var(--txm)' }}>Amount</th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Status</th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Date</th>
                  </>
                ) : drilldown.metric === 'present' || drilldown.metric === 'leave' ? (
                  <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Date</th>
                ) : (
                  <>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Notification</th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Customer</th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Status</th>
                    <th style={{ ...cellStyle, textAlign: 'left', fontSize: 10, color: 'var(--txm)' }}>Date</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {drilldown.rows.map(row => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--gm)' }}>
                  {drilldown.metric === 'expenses' ? (
                    <>
                      <td style={cellStyle}>{row.woNumber || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right' }}>₹{(row.amount ?? 0).toLocaleString('en-IN')}</td>
                      <td style={cellStyle}>{row.status || '—'}</td>
                      <td style={cellStyle}>{fmtDate(row.date)}</td>
                    </>
                  ) : drilldown.metric === 'present' || drilldown.metric === 'leave' ? (
                    <td style={cellStyle}>{fmtDate(row.date)}</td>
                  ) : (
                    <>
                      <td style={cellStyle}>{row.woNumber || '—'}</td>
                      <td style={cellStyle}>{row.customerName || '—'}</td>
                      <td style={cellStyle}>{row.status || '—'}</td>
                      <td style={cellStyle}>{fmtDate(row.date)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </>
  )
}
