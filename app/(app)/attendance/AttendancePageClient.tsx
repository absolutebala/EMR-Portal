'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import Topbar from '@/components/layout/Topbar'
import { getAttendanceOverview, type AttendanceOverviewRow, type AttendanceOverviewJob } from '@/app/actions/get-attendance'
import { approveRejectAttendanceAmendment, getAttendanceExportRows } from '@/app/actions/attendance'
import { getAttendanceStatusLabel, type PendingAmendment, type AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'
import PendingAmendmentsModal from './PendingAmendmentsModal'
import { toDateStr, getRange, type ViewMode } from './dateRange'

const JOB_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
  no_show: { bg: '#FEE2E2', color: '#DC2626', label: "Engineer didn't show up" },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
}

const ATTENDANCE_CFG: Record<AttendanceEffectiveStatus['kind'], { bg: string; color: string }> = {
  present: { bg: '#D1FAE5', color: '#065F46' },
  leave: { bg: '#FEE2E2', color: '#DC2626' },
  holiday: { bg: '#F1F5F9', color: '#475569' },
  weekly_off: { bg: '#F3F4F6', color: '#6B7280' },
  pending: { bg: '#FEF3C7', color: '#D97706' },
  not_applicable: { bg: '#F3F4F6', color: '#B0A8AC' },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateCell(dateStr: string): { weekday: string; dayMonth: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    dayMonth: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  }
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? 'var(--m)' : 'var(--gm)'}`,
  background: active ? 'var(--m)' : '#fff', color: active ? '#fff' : 'var(--tx)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins,sans-serif',
})

function AttendanceCell({ row }: { row: AttendanceOverviewRow }) {
  const cfg = ATTENDANCE_CFG[row.attendance.kind]
  const label = getAttendanceStatusLabel(row.attendance)
  let timeLabel: string | null = null
  if (row.attendance.kind === 'present') timeLabel = row.markedAt ? formatTime(row.markedAt) : null
  else if (row.attendance.kind === 'leave') timeLabel = row.attendance.markedAt ? formatTime(row.attendance.markedAt) : '11:00 AM'

  return (
    <div>
      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '3px 9px' }}>
        {label}
      </span>
      {timeLabel && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 4 }}>{timeLabel}</div>}
    </div>
  )
}

function JobCard({ job }: { job: AttendanceOverviewJob }) {
  const cfg = JOB_STATUS_CFG[job.state.kind]
  return (
    <div style={{ padding: '7px 9px', borderRadius: 6, background: cfg.bg + '40', borderLeft: `3px solid ${cfg.color}` }}>
      <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: 11 }}>{job.projectName || '—'}</div>
      <div style={{ color: 'var(--txm)', fontSize: 10, marginTop: 2 }}>Serial: {job.serialNumbers}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {job.endUserType && <span style={{ fontSize: 9, color: 'var(--txm)' }}>{job.endUserType}</span>}
        <span style={{ fontSize: 10, color: 'var(--txm)' }}>{job.woNumber}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        {job.state.kind === 'in_progress' && (
          <>
            <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>Checked in {formatTime(job.state.checkedInAt)}</div>
            {job.state.followUpDate && <div style={{ fontSize: 10, color: 'var(--txm)' }}>Follow-up: {job.state.followUpDate}</div>}
            {job.state.needsReassignment && (
              <span style={{ display: 'inline-block', marginTop: 2, fontSize: 9, fontWeight: 600, color: '#9A3412', background: '#FED7AA', borderRadius: 20, padding: '1px 7px' }}>
                Needs reassignment
              </span>
            )}
          </>
        )}
        {job.state.kind === 'completed' && (
          <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
            Checked in {formatTime(job.state.checkedInAt)} · Completed {formatTime(job.state.completedAt)}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  initialRows: AttendanceOverviewRow[]
  initialError: string | null
  initialAmendments: PendingAmendment[]
  canApprove: boolean
  userName: string
  userRole: string
}

export default function AttendancePageClient({ initialRows, initialError, initialAmendments, canApprove, userName, userRole }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const isFirstRun = useRef(true)

  const [amendments, setAmendments] = useState(initialAmendments)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [showAmendmentsModal, setShowAmendmentsModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchorDate, setAnchorDate] = useState(new Date())
  const todayForInputs = toDateStr(new Date())
  const [customFrom, setCustomFrom] = useState(todayForInputs)
  const [customTo, setCustomTo] = useState(todayForInputs)

  const range = useMemo(() => getRange(viewMode, anchorDate, customFrom, customTo), [viewMode, anchorDate, customFrom, customTo])
  const customInvalid = viewMode === 'custom' && (!customFrom || !customTo || customFrom > customTo)

  async function handleDecision(id: string, decision: 'approved' | 'rejected') {
    setActingOn(id)
    const { error: err } = await approveRejectAttendanceAmendment(id, decision)
    setActingOn(null)
    if (err) { setExportError(err); return }
    setAmendments(prev => {
      const next = prev.filter(a => a.id !== id)
      if (next.length === 0) setShowAmendmentsModal(false)
      return next
    })
  }

  async function handleExport() {
    setExporting(true)
    setExportError('')
    const { rows: exportRows, error: err } = await getAttendanceExportRows(range.from, range.to)
    setExporting(false)
    if (err) { setExportError(err); return }
    if (!exportRows.length) { setExportError('No attendance data in this range to export.'); return }

    const headers = ['Engineer', 'Date', 'Status', 'Marked At', 'Reason']
    const aoa = [headers, ...exportRows.map(r => [
      r.engineerName, r.date, r.status,
      r.markedAt ? new Date(r.markedAt).toLocaleString('en-IN') : '',
      r.reason || '',
    ])]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = headers.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `attendance_${range.from}_to_${range.to}.xlsx`)
  }

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true)
    const { rows: r, error: err } = await getAttendanceOverview(from, to)
    setRows(r)
    setError(err)
    setLoading(false)
  }, [])

  // The default "This Week" range was already fetched server-side and passed in as
  // props — only re-fetch once the range actually changes (tab switch, prev/next, or
  // a custom range edit).
  useEffect(() => {
    if (customInvalid) return
    if (isFirstRun.current) { isFirstRun.current = false; return }
    load(range.from, range.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, customInvalid])

  function selectMode(mode: ViewMode) {
    setViewMode(mode)
    if (mode !== 'custom') setAnchorDate(new Date())
  }

  function goPrev() {
    if (viewMode === 'week') setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    else if (viewMode === 'month') setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function goNext() {
    if (viewMode === 'week') setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    else if (viewMode === 'month') setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  const todayStr = new Date().toLocaleDateString('en-CA')

  // Group consecutive rows by engineer (server already sorts engineer-then-date) so
  // the Field Engineer column can span the whole group instead of repeating the name
  // on every date row.
  const groups = useMemo(() => {
    const g: { engineerId: string; engineerName: string; rows: AttendanceOverviewRow[] }[] = []
    for (const row of rows) {
      const last = g[g.length - 1]
      if (last && last.engineerId === row.engineerId) last.rows.push(row)
      else g.push({ engineerId: row.engineerId, engineerName: row.engineerName, rows: [row] })
    }
    return g
  }, [rows])

  return (
    <>
      <Topbar title="Attendance" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 14, flexShrink: 0 }}>
          Daily attendance and job detail by field engineer. Past dates show what actually happened that day; today and upcoming dates show current status.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={tabStyle(viewMode === 'week')} onClick={() => selectMode('week')}>This Week</button>
            <button style={tabStyle(viewMode === 'month')} onClick={() => selectMode('month')}>This Month</button>
            <button style={tabStyle(viewMode === 'custom')} onClick={() => selectMode('custom')}>Custom</button>
          </div>

          {viewMode !== 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={goPrev} aria-label="Previous"
                style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 160, textAlign: 'center' }}>{range.label}</span>
              <button onClick={goNext} aria-label="Next"
                style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" fill="none" stroke="var(--tx)" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>From</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }} />
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}>To</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }} />
              {customInvalid && <span style={{ fontSize: 11, color: '#DC2626' }}>Pick a valid range (From must be on or before To).</span>}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        {exportError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{exportError}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
          {canApprove && amendments.length > 0 ? (
            <button
              onClick={() => setShowAmendmentsModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid #DC2626', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif' }}
            >
              Pending attendance amendments ({amendments.length})
            </button>
          ) : <span />}

          <button
            onClick={handleExport}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--m)', background: '#fff', color: 'var(--m)', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: exporting ? 0.7 : 1 }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {exporting ? 'Exporting…' : `Export ${range.label} to Excel`}
          </button>
        </div>

        {showAmendmentsModal && (
          <PendingAmendmentsModal amendments={amendments} actingOn={actingOn} onDecision={handleDecision} onClose={() => setShowAmendmentsModal(false)} />
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading attendance…</div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No field engineers found.</div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {['Field Engineer', 'Date', 'Attendance', 'Jobs'].map((h, i) => (
                      <th key={h} style={{
                        position: 'sticky', top: 0, zIndex: 2, minWidth: i === 0 ? 140 : i === 1 ? 100 : i === 2 ? 120 : 260,
                        padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600,
                        color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)',
                        background: '#FAFAFA', whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) => g.rows.map((row, ri) => {
                    const isToday = row.date === todayStr
                    const isPast = row.date < todayStr
                    const { weekday, dayMonth } = formatDateCell(row.date)
                    const isLastRowOfGroup = ri === g.rows.length - 1
                    return (
                      <tr key={`${row.engineerId}:${row.date}`}>
                        {ri === 0 && (
                          <td rowSpan={g.rows.length} style={{
                            padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)',
                            background: '#fff', borderRight: '1px solid var(--gm)',
                            borderBottom: gi < groups.length - 1 ? '1px solid var(--gm)' : 'none', whiteSpace: 'nowrap', verticalAlign: 'top',
                          }}>
                            {g.engineerName}
                          </td>
                        )}
                        <td style={{
                          padding: '10px 14px', fontSize: 11, verticalAlign: 'top', whiteSpace: 'nowrap',
                          color: isToday ? 'var(--m)' : isPast ? '#B0A8AC' : 'var(--tx)',
                          background: isToday ? '#FDF7F9' : isPast ? '#FBFAFB' : '#fff',
                          borderBottom: (isLastRowOfGroup && gi < groups.length - 1) || !isLastRowOfGroup ? '1px solid var(--gl)' : 'none',
                        }}>
                          <div>{weekday}</div>
                          <div style={{ fontSize: 10, marginTop: 1 }}>{dayMonth}</div>
                        </td>
                        <td style={{
                          padding: '10px 14px', verticalAlign: 'top',
                          background: isToday ? '#FDF7F9' : isPast ? '#FBFAFB' : '#fff',
                          borderBottom: (isLastRowOfGroup && gi < groups.length - 1) || !isLastRowOfGroup ? '1px solid var(--gl)' : 'none',
                        }}>
                          <AttendanceCell row={row} />
                        </td>
                        <td style={{
                          padding: '8px 14px', verticalAlign: 'top',
                          background: isToday ? '#FDF7F9' : isPast ? '#FBFAFB' : '#fff',
                          borderBottom: (isLastRowOfGroup && gi < groups.length - 1) || !isLastRowOfGroup ? '1px solid var(--gl)' : 'none',
                        }}>
                          {row.jobs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {row.jobs.map(job => <JobCard key={job.workOrderId} job={job} />)}
                            </div>
                          ) : (
                            <span style={{ color: '#D8D2D5', fontSize: 11 }}>No job scheduled</span>
                          )}
                        </td>
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
