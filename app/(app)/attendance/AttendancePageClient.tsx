'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import Topbar from '@/components/layout/Topbar'
import { getAttendanceOverview, type AttendanceOverviewRow, type AttendanceOverviewJob, type AttendanceStats } from '@/app/actions/get-attendance'
import { approveRejectAttendanceAmendment } from '@/app/actions/attendance'
import type { PendingAmendment, AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Duplicated from lib/mobile/core/attendance.ts's getAttendanceStatusLabel rather
// than imported — that module also pulls in server-only code (web-push via
// lib/notifications.ts), which breaks the client bundle if imported at runtime
// (not just as a type) from a 'use client' file.
function attendanceLabel(s: AttendanceEffectiveStatus): string {
  switch (s.kind) {
    case 'present': {
      const flags: string[] = []
      if (s.lateIn) flags.push('Late In')
      if (s.earlyOut) flags.push('Short Hours')
      if (s.singlePunch) flags.push('Single Punch')
      if (!flags.length) return 'Present'
      const decision = s.rejected ? 'rejected' : s.pendingApproval ? 'pending approval' : s.amended ? 'approved' : null
      return `Present (${flags.join(', ')}${decision ? ` — ${decision}` : ''})`
    }
    case 'leave': {
      const causes = [s.lateIn && 'Late In', s.earlyOut && 'Short Hours', s.singlePunch && 'Single Punch'].filter(Boolean).join(', ')
      const suffix = s.rejected ? ' — amendment rejected' : s.pendingApproval ? ' — pending approval' : ''
      return `Absent${causes ? ` (${causes})` : ''}${suffix}`
    }
    case 'holiday': return `Holiday: ${s.name}`
    case 'weekly_off': return 'Weekly Off'
    case 'pending': return 'Pending'
    case 'not_applicable': return '—'
  }
}

// Excel sheet names: max 31 chars, can't contain : \ / ? * [ ], can't be blank,
// can't repeat within a workbook — dedupe collisions with a numeric suffix.
function sheetNameFor(name: string, used: Set<string>): string {
  const base = (name.trim() || 'Engineer').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Engineer'
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` (${n})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate)
  return candidate
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

interface AttendanceCellProps {
  row: AttendanceOverviewRow
  canApprove: boolean
  actingOn: string | null
  onDecision: (id: string, decision: 'approved' | 'rejected') => void
}

function AttendanceCell({ row, canApprove, actingOn, onDecision }: AttendanceCellProps) {
  const s = row.attendance
  // A Present day with a Late In/Early Out/Single Punch flag still pending or
  // rejected gets the same amber/red treatment as a Leave amendment — plain
  // Present (or an approved amendment) stays green. Every other kind uses the
  // static palette.
  const cfg = s.kind === 'present' && (s.pendingApproval || s.rejected)
    ? (s.rejected ? { bg: '#FEE2E2', color: '#991B1B' } : { bg: '#FEF3C7', color: '#92400E' })
    : ATTENDANCE_CFG[s.kind]
  const label = attendanceLabel(s)

  // Present and a plain (not pending/rejected) explicit Leave show their own real
  // timestamp, unlabeled, matching how it read before this cell grew the
  // Requested/Reason/Approved lines below — auto-computed Leave with no row at all
  // shows nothing here (no fake placeholder).
  let timeLabel: string | null = null
  if (s.kind === 'present') timeLabel = row.markedAt ? formatTime(row.markedAt) : null
  else if (s.kind === 'leave' && !s.pendingApproval && !s.rejected) timeLabel = s.markedAt ? formatTime(s.markedAt) : null

  const hasReason = (s.kind === 'present' || s.kind === 'leave') && !!s.reason
  const hasDecision = (s.kind === 'present' || s.kind === 'leave') && (s.rejected || (s.kind === 'present' && s.amended))
  const decisionLabel = (s.kind === 'present' || s.kind === 'leave') && s.rejected ? 'Rejected' : 'Approved'
  const showPendingActions = canApprove && (s.kind === 'leave' || s.kind === 'present') && s.pendingApproval && !!row.attendanceId

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '3px 9px' }}>
          {label}
        </span>
        {showPendingActions && (
          <>
            <button
              onClick={() => onDecision(row.attendanceId!, 'approved')}
              disabled={actingOn === row.attendanceId}
              title="Approve"
              style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: '#D1FAE5', color: '#065F46', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >
              ✓
            </button>
            <button
              onClick={() => onDecision(row.attendanceId!, 'rejected')}
              disabled={actingOn === row.attendanceId}
              title="Reject"
              style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: '#FEE2E2', color: '#991B1B', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >
              ✗
            </button>
          </>
        )}
      </div>
      {timeLabel && (
        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 4 }}>
          {timeLabel}{row.placeName ? ` — ${row.placeName}` : ''}
        </div>
      )}
      {s.kind === 'leave' && s.pendingApproval && s.markedAt && (
        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 4 }}>
          Requested: {formatDateTime(s.markedAt)}{row.placeName ? ` — ${row.placeName}` : ''}
        </div>
      )}
      {hasReason && (s.kind === 'present' || s.kind === 'leave') && (
        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>Reason: {s.reason}</div>
      )}
      {hasDecision && (s.kind === 'present' || s.kind === 'leave') && (
        <>
          {s.approvedByName && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>{decisionLabel} by: {s.approvedByName}</div>}
          {s.approvedAt && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>{decisionLabel}: {formatDateTime(s.approvedAt)}</div>}
        </>
      )}
      {row.endDayAt && (
        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
          Punched out: {formatTime(row.endDayAt)}{row.endDayPlaceName ? ` — ${row.endDayPlaceName}` : ''}
        </div>
      )}
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
  stats: AttendanceStats | null
  canApprove: boolean
  userName: string
  userRole: string
}

// Org-wide summary of today's Present / Absent / Late In / Short Hours / Single Punch
// (independent of the grid filter), rendered as a full-width strip of colour-coded metric
// cards. Only today's counts are shown — week/month totals conflated different days and
// read as confusing next to the single-day grid below.
function StatsPanel({ stats }: { stats: AttendanceStats | null }) {
  if (!stats) return null
  const cols: { key: 'present' | 'absent' | 'lateIn' | 'shortHours' | 'singlePunch'; label: string; color: string; bg: string; border: string }[] = [
    { key: 'present', label: 'Present', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
    { key: 'absent', label: 'Absent', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
    { key: 'lateIn', label: 'Late In', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
    { key: 'shortHours', label: 'Short Hours', color: '#9A3412', bg: '#FFF7ED', border: '#FED7AA' },
    { key: 'singlePunch', label: 'Single Punch', color: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16, flexShrink: 0 }}>
      {cols.map(c => (
        <div key={c.key} style={{ border: `1px solid ${c.border}`, background: c.bg, borderRadius: 10, padding: '12px 16px', fontFamily: 'Poppins,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '.5px' }}>{c.label}</div>
            <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3 }}>Today</div>
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, color: c.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{stats.today[c.key]}</span>
        </div>
      ))}
    </div>
  )
}

export default function AttendancePageClient({ initialRows, initialError, initialAmendments, stats, canApprove, userName, userRole }: Props) {
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
    // Refresh the grid too — not just the separate pending-amendments list — so the
    // cell itself flips from "Leave (pending)" to "Present (amended)"/rejected
    // immediately, whether the decision came from the popup or the inline cell
    // buttons.
    load(range.from, range.to)
  }

  // Built from the already-loaded `rows` (same data the table renders) rather than a
  // separate export query — that data already carries job/project detail per
  // engineer/date, which the old export (attendance-table-only) never had.
  // One sheet per engineer, rather than everyone on a single tab, so a manager
  // reviewing one engineer's month doesn't have to filter/scroll past everyone else's.
  function handleExport() {
    setExporting(true)
    setExportError('')
    if (!rows.length) { setExporting(false); setExportError('No attendance data in this range to export.'); return }

    const headers = ['Engineer', 'Date', 'Attendance Status', 'Punched In At', 'Punch In Location', 'Reason', 'Approved By', 'Approved Date', 'Punched Out At', 'Punch Out Location', 'Project Name', 'Job Status']

    const byEngineer = new Map<string, { name: string; rows: AttendanceOverviewRow[] }>()
    for (const row of rows) {
      const entry = byEngineer.get(row.engineerId)
      if (entry) entry.rows.push(row)
      else byEngineer.set(row.engineerId, { name: row.engineerName, rows: [row] })
    }

    const wb = XLSX.utils.book_new()
    const usedSheetNames = new Set<string>()
    for (const { name, rows: engRows } of byEngineer.values()) {
      const aoa: string[][] = [headers]
      for (const row of engRows) {
        const s = row.attendance
        const attendanceStatus = attendanceLabel(s)
        const markedAt = s.kind === 'present'
          ? (row.markedAt ? new Date(row.markedAt).toLocaleString('en-IN') : '')
          : s.kind === 'leave'
            ? (s.markedAt ? new Date(s.markedAt).toLocaleString('en-IN') : '')
            : ''
        const reason = s.kind === 'present' || s.kind === 'leave' ? (s.reason || '') : ''
        const approvedBy = s.kind === 'present' || s.kind === 'leave' ? (s.approvedByName || '') : ''
        const approvedAt = s.kind === 'present' || s.kind === 'leave' ? (s.approvedAt ? new Date(s.approvedAt).toLocaleString('en-IN') : '') : ''
        const markedAtLocation = row.placeName || ''
        const endDayAt = row.endDayAt ? new Date(row.endDayAt).toLocaleString('en-IN') : ''
        const endDayLocation = row.endDayPlaceName || ''
        if (row.jobs.length === 0) {
          aoa.push([row.engineerName, row.date, attendanceStatus, markedAt, markedAtLocation, reason, approvedBy, approvedAt, endDayAt, endDayLocation, '', ''])
        } else {
          for (const job of row.jobs) {
            aoa.push([row.engineerName, row.date, attendanceStatus, markedAt, markedAtLocation, reason, approvedBy, approvedAt, endDayAt, endDayLocation, job.projectName || '', JOB_STATUS_CFG[job.state.kind].label])
          }
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = headers.map(() => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(wb, ws, sheetNameFor(name, usedSheetNames))
    }

    XLSX.writeFile(wb, `attendance_${range.from}_to_${range.to}.xlsx`)
    setExporting(false)
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

// Pivots the flat engineer/date rows back into an engineer x date matrix — the
// server always returns one row per engineer per date in the range (see
// getAttendanceOverview), so every engineer has an entry for every date.
  const { engineers, dates, cellByEngDate } = useMemo(() => {
    const engList: { id: string; name: string }[] = []
    const seenEng = new Set<string>()
    const dateList: string[] = []
    const seenDate = new Set<string>()
    const cells: Record<string, AttendanceOverviewRow> = {}
    for (const row of rows) {
      if (!seenEng.has(row.engineerId)) { seenEng.add(row.engineerId); engList.push({ id: row.engineerId, name: row.engineerName }) }
      if (!seenDate.has(row.date)) { seenDate.add(row.date); dateList.push(row.date) }
      cells[`${row.engineerId}:${row.date}`] = row
    }
    // Field engineers listed A→Z by name by default (case-insensitive, natural order).
    engList.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
    return { engineers: engList, dates: dateList, cellByEngDate: cells }
  }, [rows])

  return (
    <>
      <Topbar title="Attendance" userName={userName} userRole={userRole} />
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, padding: '22px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Single controls bar: period tabs + range navigation on the left, actions
            (amendments / export) pushed to the right so the row's width is used up
            instead of leaving a dead zone. */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {canApprove && amendments.length > 0 && (
              <button
                onClick={() => setShowAmendmentsModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid #DC2626', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif' }}
              >
                Pending amendments ({amendments.length})
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--m)', background: '#fff', color: 'var(--m)', cursor: exporting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: exporting ? 0.7 : 1 }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {exporting ? 'Exporting…' : `Export to Excel`}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{error}</div>
        )}

        {exportError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14, flexShrink: 0 }}>{exportError}</div>
        )}

        <StatsPanel stats={stats} />

        {showAmendmentsModal && (
          <PendingAmendmentsModal amendments={amendments} actingOn={actingOn} onDecision={handleDecision} onClose={() => setShowAmendmentsModal(false)} />
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading attendance…</div>
          ) : engineers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>No field engineers found.</div>
          ) : (
            <div className="attn-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
              {/* Bigger, always-visible scrollbars so the horizontal scroll (extra date
                  columns) and vertical scroll (long engineer list) are easy to grab. */}
              <style>{`
                .attn-scroll { scrollbar-width: auto; scrollbar-color: #b8adb2 #f1ecee; }
                .attn-scroll::-webkit-scrollbar { width: 16px; height: 16px; }
                .attn-scroll::-webkit-scrollbar-track { background: #f1ecee; }
                .attn-scroll::-webkit-scrollbar-thumb { background: #b8adb2; border-radius: 10px; border: 4px solid #f1ecee; }
                .attn-scroll::-webkit-scrollbar-thumb:hover { background: #9a8d93; }
                .attn-scroll::-webkit-scrollbar-corner { background: #f1ecee; }
              `}</style>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{
                      position: 'sticky', top: 0, left: 0, zIndex: 3, minWidth: 150, padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600,
                      color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', borderRight: '1px solid var(--gm)',
                      background: '#FAFAFA', whiteSpace: 'nowrap',
                    }}>
                      Field Engineer
                    </th>
                    {dates.map(dateStr => {
                      const { weekday, dayMonth } = formatDateCell(dateStr)
                      const isToday = dateStr === todayStr
                      const isPast = dateStr < todayStr
                      const isWeekend = weekday === 'Sun' || weekday === 'Sat'
                      return (
                        <th key={dateStr} style={{
                          position: 'sticky', top: 0, zIndex: 2, minWidth: 230, padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
                          color: isToday ? 'var(--m)' : isPast ? '#B0A8AC' : 'var(--txm)', borderBottom: '1px solid var(--gm)',
                          background: isToday ? 'var(--mp)' : isPast ? '#F5F3F5' : isWeekend ? '#FAFAFA' : '#fff', whiteSpace: 'nowrap',
                        }}>
                          <div>{weekday}</div>
                          <div style={{ fontSize: 11, marginTop: 1 }}>{dayMonth}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {engineers.map((eng, ei) => (
                    <tr key={eng.id}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--tx)',
                        background: '#fff', borderRight: '1px solid var(--gm)',
                        borderBottom: ei < engineers.length - 1 ? '1px solid var(--gm)' : 'none', whiteSpace: 'nowrap', verticalAlign: 'top',
                      }}>
                        {eng.name}
                      </td>
                      {dates.map(dateStr => {
                        const row = cellByEngDate[`${eng.id}:${dateStr}`]
                        const isToday = dateStr === todayStr
                        const isPast = dateStr < todayStr
                        return (
                          <td key={dateStr} style={{
                            padding: '8px 10px', verticalAlign: 'top',
                            background: isToday ? '#FDF7F9' : isPast ? '#FBFAFB' : '#fff',
                            borderBottom: ei < engineers.length - 1 ? '1px solid var(--gl)' : 'none',
                          }}>
                            {row && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <AttendanceCell row={row} canApprove={canApprove} actingOn={actingOn} onDecision={handleDecision} />
                                {row.jobs.length > 0 ? (
                                  row.jobs.map(job => <JobCard key={job.workOrderId} job={job} />)
                                ) : (
                                  <span style={{ color: '#D8D2D5', fontSize: 11 }}>No job scheduled</span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
