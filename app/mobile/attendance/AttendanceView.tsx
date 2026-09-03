'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { reverseGeocode } from '@/app/actions/mobile-actions'
import { markAttendance, markEndDay, getAttendanceCalendar, requestAttendanceAmendment } from '@/app/actions/attendance'
import type { AttendanceCalendarDay, AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'

interface Props {
  initialDays: AttendanceCalendarDay[]
  initialError: string | null
  todayStr: string
  engineerName: string
}

function presentFlags(s: Extract<AttendanceEffectiveStatus, { kind: 'present' }>): string[] {
  const flags: string[] = []
  if (s.lateIn) flags.push('Late In')
  if (s.earlyOut) flags.push('Short Hours')
  if (s.singlePunch) flags.push('Single Punch')
  return flags
}

function getStatusBadge(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string } {
  switch (status.kind) {
    case 'present': {
      const flags = presentFlags(status)
      if (!flags.length) return { bg: '#D1FAE5', color: '#065F46', label: 'Present' }
      const bg = status.rejected ? '#FEE2E2' : status.pendingApproval ? '#FEF3C7' : '#D1FAE5'
      const color = status.rejected ? '#991B1B' : status.pendingApproval ? '#92400E' : '#065F46'
      return { bg, color, label: `Present (${flags.join(', ')})` }
    }
    case 'leave': {
      const causes = [status.lateIn && 'Late In', status.earlyOut && 'Short Hours', status.singlePunch && 'Single Punch'].filter(Boolean).join(', ')
      const suffix = status.pendingApproval ? ' — pending approval' : status.rejected ? ' — amendment rejected' : ''
      return { bg: '#FEE2E2', color: '#991B1B', label: `Absent${causes ? ` (${causes})` : ''}${suffix}` }
    }
    case 'pending': return { bg: '#FEF3C7', color: '#92400E', label: 'Not marked yet' }
    case 'holiday': return { bg: '#F1F5F9', color: '#475569', label: `Holiday: ${status.name}` }
    case 'weekly_off': return { bg: '#F1F5F9', color: '#475569', label: 'Weekly Off' }
    case 'not_applicable': return { bg: '#F1F5F9', color: '#475569', label: '—' }
  }
}

// Duplicated from lib/mobile/core/attendance.ts's getAttendanceStatusLabel rather than
// imported at runtime — that module also pulls in server-only code (web-push via
// lib/notifications.ts), which breaks the client bundle if imported as anything but a
// type from a 'use client' file (hit this exact break earlier in this project).
function attendanceLabel(s: AttendanceEffectiveStatus): string {
  switch (s.kind) {
    case 'present': {
      const flags = presentFlags(s)
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

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

function mondayOf(d: Date): Date {
  const monday = new Date(d)
  const day = monday.getDay() // 0 = Sunday
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day))
  return monday
}

function weekRange(anchor: Date): { from: string; to: string; label: string } {
  const monday = mondayOf(anchor)
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  return {
    from: toDateStr(monday),
    to: toDateStr(saturday),
    label: `${monday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${saturday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
  }
}

function monthRangeFor(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: toDateStr(from), to: toDateStr(to) }
}

// Same {from, to, label} shape as weekRange so the rest of the component doesn't
// need to branch on view mode — just wraps monthRangeFor with a month-name label.
function monthRange(anchor: Date): { from: string; to: string; label: string } {
  const { from, to } = monthRangeFor(toDateStr(anchor))
  return { from, to, label: anchor.toLocaleDateString('en-IN', { month: 'long' }) }
}

function exportDaysToXlsx(exportDays: AttendanceCalendarDay[], filename: string) {
  const headers = ['Date', 'Status', 'Punched In At', 'Reason', 'Approved By', 'Approved Date', 'Punched Out At', 'Punch Out Location']
  const aoa = [headers, ...exportDays.map(d => {
    const markedAt = d.markedAt ? new Date(d.markedAt).toLocaleString('en-IN') : ''
    const reason = d.status.kind === 'present' || d.status.kind === 'leave' ? (d.status.reason || '') : ''
    const approvedBy = d.status.kind === 'present' || d.status.kind === 'leave' ? (d.status.approvedByName || '') : ''
    const approvedAt = d.status.kind === 'present' || d.status.kind === 'leave'
      ? (d.status.approvedAt ? new Date(d.status.approvedAt).toLocaleString('en-IN') : '')
      : ''
    const endDayAt = d.endDayAt ? new Date(d.endDayAt).toLocaleString('en-IN') : ''
    return [d.date, attendanceLabel(d.status), markedAt, reason, approvedBy, approvedAt, endDayAt, d.endDayPlaceName || '']
  })]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = headers.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
  XLSX.writeFile(wb, filename)
}

export default function AttendanceView({ initialDays, initialError, todayStr, engineerName }: Props) {
  // Anchored to the server-provided IST "today" (not a fresh client Date()) so the
  // initial week matches exactly what page.tsx already fetched.
  const [anchorDate, setAnchorDate] = useState(() => new Date(`${todayStr}T00:00:00`))
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [days, setDays] = useState(initialDays)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const isFirstRun = useRef(true)

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [gpsError, setGpsError] = useState('')
  // Ref, not state — only ever used to prevent re-triggering the auto-capture
  // effect below, never read in JSX, so it doesn't need to be reactive.
  const gpsRequestedRef = useRef(false)
  const [gpsResolved, setGpsResolved] = useState(false)
  const [markError, setMarkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState<'pending' | 'approval' | null>(null)

  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [amendReason, setAmendReason] = useState('')
  const [amendError, setAmendError] = useState('')
  const [amendSubmitting, setAmendSubmitting] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const endDayGpsRequestedRef = useRef(false)
  const [endDayGpsResolved, setEndDayGpsResolved] = useState(false)
  const [endDayCoords, setEndDayCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [endDayPlaceName, setEndDayPlaceName] = useState('')
  const [endDayGpsError, setEndDayGpsError] = useState('')
  const [endDayError, setEndDayError] = useState('')
  const [endDaySubmitting, setEndDaySubmitting] = useState(false)

  const range = viewMode === 'week' ? weekRange(anchorDate) : monthRange(anchorDate)

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true)
    const { days: d, error: err } = await getAttendanceCalendar(from, to)
    setDays(d)
    setError(err)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    load(range.from, range.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to])

  // A Service Manager approving/rejecting an amendment happens on a different device
  // (desktop), so nothing here pushes an update — without this, "pending approval"
  // text keeps showing stale until the page is manually reloaded. Refetch whenever the
  // tab/app regains visibility (e.g. switching back after the approval landed).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') load(range.from, range.to)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to])

  const todayEntry = days.find(d => d.date === todayStr) ?? null
  const todayStatus = todayEntry?.status ?? null
  const hasPunchedIn = !!todayEntry?.markedAt
  const hasPunchedOut = !!todayEntry?.endDayAt
  const todayPending = (todayStatus?.kind === 'leave' || todayStatus?.kind === 'present') && todayStatus.pendingApproval
  // Punch In form: shown only when they haven't punched in and today is still open to
  // mark — on time (kind 'pending', before 10) or a not-yet-marked day after 10 (late).
  const showPunchIn = !justSubmitted && !hasPunchedIn && !todayPending
    && (todayStatus?.kind === 'pending' || (todayStatus?.kind === 'leave' && todayStatus.noShow))
  const isLatePunchIn = todayStatus?.kind === 'leave'

  function goPrev() {
    setAnchorDate(d => {
      if (viewMode === 'week') { const n = new Date(d); n.setDate(n.getDate() - 7); return n }
      // Built from year/month directly (day pinned to 1) rather than mutating the
      // existing day-of-month — avoids JS's month-rollover quirk (e.g. Mar 31 minus
      // one month silently becoming Mar 3 instead of Feb).
      return new Date(d.getFullYear(), d.getMonth() - 1, 1)
    })
  }
  function goNext() {
    setAnchorDate(d => {
      if (viewMode === 'week') { const n = new Date(d); n.setDate(n.getDate() + 7); return n }
      return new Date(d.getFullYear(), d.getMonth() + 1, 1)
    })
  }

  function startGpsCapture() {
    gpsRequestedRef.current = true
    setGpsError('')
    if (!('geolocation' in navigator)) {
      setGpsResolved(true)
      setGpsError('GPS not available on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(c)
        setGpsResolved(true)
        reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setPlaceName(label) })
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            setCoords(c)
            setGpsResolved(true)
            reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setPlaceName(label) })
          },
          () => { setGpsResolved(true); setGpsError('Could not get location — you can still mark attendance without it') },
          { enableHighAccuracy: false, timeout: 10000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  // GPS starts capturing in the background as soon as marking is needed — no
  // separate "capture location" tap. The submit button is available right away
  // (see JSX below); if GPS hasn't resolved by the time it's tapped, coords just
  // go through null, same as an outright GPS failure already does.
  useEffect(() => {
    if (showPunchIn && !gpsRequestedRef.current) startGpsCapture()
  }, [showPunchIn])

  async function handleMark() {
    setMarkError('')
    // Punch In simply records — no reason needed even if late. A late punch-in makes the
    // day Absent, and the engineer requests an amendment separately if they want it.
    setSubmitting(true)
    const result = await markAttendance({
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      placeName: placeName || null,
      reason: null,
    })
    setSubmitting(false)
    if (result.error) { setMarkError(result.error); return }
    setJustSubmitted('pending')
    load(range.from, range.to)
  }

  // Same GPS-capture flow as marking Present, dedicated state — End Day is a
  // separate action from the app's own Sign Out (which stays ungated).
  function startEndDayGpsCapture() {
    endDayGpsRequestedRef.current = true
    setEndDayGpsError('')
    if (!('geolocation' in navigator)) {
      setEndDayGpsResolved(true)
      setEndDayGpsError('GPS not available on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setEndDayCoords(c)
        setEndDayGpsResolved(true)
        reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setEndDayPlaceName(label) })
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            setEndDayCoords(c)
            setEndDayGpsResolved(true)
            reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setEndDayPlaceName(label) })
          },
          () => { setEndDayGpsResolved(true); setEndDayGpsError('Could not get location — you can still end your day without it') },
          { enableHighAccuracy: false, timeout: 10000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  // Punch Out is available any time after Punch In (no enable-time gate). Start the
  // background GPS capture as soon as it becomes relevant.
  const canPunchOutNow = hasPunchedIn && !hasPunchedOut
  useEffect(() => {
    if (canPunchOutNow && !endDayGpsRequestedRef.current) startEndDayGpsCapture()
  }, [canPunchOutNow])

  async function handleEndDay() {
    setEndDayError('')
    setEndDaySubmitting(true)
    const result = await markEndDay({
      latitude: endDayCoords?.lat ?? null,
      longitude: endDayCoords?.lng ?? null,
      placeName: endDayPlaceName || null,
      reason: null,
    })
    setEndDaySubmitting(false)
    if (result.error) { setEndDayError(result.error); return }
    load(range.from, range.to)
  }

  // Any past Absent day this month with no pending request can request an amendment; a
  // rejected day can request again. Today's amendment is offered on the today card above,
  // so it's excluded here to avoid a duplicate form.
  function isAmendable(day: AttendanceCalendarDay): boolean {
    return day.status.kind === 'leave' && !day.status.pendingApproval
      && day.date !== todayStr && day.date.slice(0, 7) === todayStr.slice(0, 7)
  }

  function toggleDay(day: AttendanceCalendarDay) {
    if (!isAmendable(day)) return
    if (expandedDate === day.date) { setExpandedDate(null); return }
    setExpandedDate(day.date)
    setAmendReason(''); setAmendError('')
  }

  async function handleAmendSubmit(dateStr: string) {
    setAmendError('')
    if (!amendReason.trim()) {
      setAmendError('Please give a reason for this amendment')
      return
    }
    setAmendSubmitting(true)
    const result = await requestAttendanceAmendment({ attendanceDate: dateStr, reason: amendReason.trim() })
    setAmendSubmitting(false)
    if (result.error) { setAmendError(result.error); return }
    setExpandedDate(null)
    load(range.from, range.to)
  }

  function handleExportWeek() {
    setExporting(true)
    setExportError('')
    getAttendanceCalendar(range.from, range.to).then(({ days: d, error: err }) => {
      setExporting(false)
      if (err) { setExportError(err); return }
      exportDaysToXlsx(d, `${engineerName}_attendance_${range.from}_to_${range.to}.xlsx`)
    })
  }

  function handleExportMonth() {
    const { from, to } = monthRangeFor(todayStr)
    setExporting(true)
    setExportError('')
    getAttendanceCalendar(from, to).then(({ days: d, error: err }) => {
      setExporting(false)
      if (err) { setExportError(err); return }
      exportDaysToXlsx(d, `${engineerName}_attendance_${from}_to_${to}.xlsx`)
    })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Attendance" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 100 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <button
            className="mtap"
            onClick={goPrev}
            aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E0E3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="14" height="14" fill="none" stroke="#1C0D14" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          <div style={{ flex: 1, display: 'flex', gap: 3, background: 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 3 }}>
            <button
              className="mtap"
              onClick={() => setViewMode('week')}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'Poppins, sans-serif',
                background: viewMode === 'week' ? '#fff' : 'transparent',
                color: viewMode === 'week' ? '#1C0D14' : '#7A6870',
                boxShadow: viewMode === 'week' ? '0 1px 3px rgba(125,29,63,0.1)' : 'none',
              }}
            >
              {viewMode === 'week' ? range.label : 'Week'}
            </button>
            <button
              className="mtap"
              onClick={() => setViewMode('month')}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'Poppins, sans-serif',
                background: viewMode === 'month' ? '#fff' : 'transparent',
                color: viewMode === 'month' ? '#1C0D14' : '#7A6870',
                boxShadow: viewMode === 'month' ? '0 1px 3px rgba(125,29,63,0.1)' : 'none',
              }}
            >
              {viewMode === 'month' ? range.label : 'Month'}
            </button>
          </div>

          <button
            className="mtap"
            onClick={goNext}
            aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E0E3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="14" height="14" fill="none" stroke="#1C0D14" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            className="mtap"
            onClick={handleExportWeek}
            disabled={exporting}
            style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #7D1D3F', background: '#fff', color: '#7D1D3F', fontSize: 11, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            Export Week
          </button>
          <button
            className="mtap"
            onClick={handleExportMonth}
            disabled={exporting}
            style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #7D1D3F', background: '#fff', color: '#7D1D3F', fontSize: 11, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            Export Month
          </button>
        </div>
        {exportError && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '8px 10px', fontSize: 11, marginBottom: 12 }}>{exportError}</div>
        )}

        {justSubmitted && (
          <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#065F46', marginBottom: 12 }}>
            {justSubmitted === 'approval' ? "Submitted — your Service Manager will review your amendment request." : 'Attendance marked for today.'}
          </div>
        )}

        {/* Punch In — records the punch-in; a punch-in after 10:00 AM is Late In (Absent). */}
        {showPunchIn && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 16, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14', margin: '0 0 4px' }}>Punch In</p>
            {isLatePunchIn && (
              <p style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5, margin: '0 0 8px' }}>
                It&apos;s past 10:00 AM — this will be recorded as <strong>Absent (Late In)</strong>. You can request an amendment after you punch out.
              </p>
            )}
            <div style={{ fontSize: 10, color: coords ? '#059669' : gpsResolved ? '#B91C1C' : '#7A6870' }}>
              📍 {coords ? (placeName || 'Location captured') : gpsResolved ? (gpsError || 'Location unavailable — you can still punch in') : 'Getting your location…'}
            </div>
            {markError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 8 }}>{markError}</div>}
            <button className="mtap" onClick={handleMark} disabled={submitting}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: submitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 10 }}>
              {submitting ? 'Saving…' : 'Punch In'}
            </button>
          </div>
        )}

        {/* Punch Out — available any time after Punch In (compulsory). Under 6h = Short Hours. */}
        {canPunchOutNow && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 16, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14', margin: '0 0 4px' }}>Punch Out</p>
            {todayEntry?.markedAt && (
              <p style={{ fontSize: 11, color: '#7A6870', margin: '0 0 8px' }}>Punched in at {formatTimeOnly(todayEntry.markedAt)}. Punch Out is compulsory — under 6 hours is Short Hours (Absent).</p>
            )}
            <div style={{ fontSize: 10, color: endDayCoords ? '#059669' : endDayGpsResolved ? '#B91C1C' : '#7A6870' }}>
              📍 {endDayCoords ? (endDayPlaceName || 'Location captured') : endDayGpsResolved ? (endDayGpsError || 'Location unavailable — you can still punch out') : 'Getting your location…'}
            </div>
            {endDayError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 8 }}>{endDayError}</div>}
            <button className="mtap" onClick={handleEndDay} disabled={endDaySubmitting}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: endDaySubmitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: endDaySubmitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 10 }}>
              {endDaySubmitting ? 'Saving…' : 'Punch Out'}
            </button>
          </div>
        )}

        {/* Today's outcome once resolved (punched out, or a pending/rejected request). */}
        {!showPunchIn && !canPunchOutNow && (todayStatus?.kind === 'present' || todayStatus?.kind === 'leave') && (todayStatus.markedAt || todayStatus.pendingApproval || todayStatus.rejected) && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 16, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            {(() => {
              const s = todayStatus
              const isPresent = s.kind === 'present'
              const causes = [s.lateIn && 'Late In', s.earlyOut && 'Short Hours', s.singlePunch && 'Single Punch'].filter(Boolean).join(', ')
              return (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: isPresent ? '#065F46' : '#991B1B', margin: '0 0 4px' }}>
                    {isPresent ? (causes ? `Present (${causes.toLowerCase()})` : 'Present') : `Absent${causes ? ` (${causes})` : ''}`}
                  </p>
                  {s.markedAt && (
                    <p style={{ fontSize: 11, color: '#7A6870', margin: '0 0 2px' }}>
                      Punched in {formatTimeOnly(s.markedAt)}{s.endDayAt ? ` · Punched out ${formatTimeOnly(s.endDayAt)}` : ''}
                    </p>
                  )}
                  {s.pendingApproval && (
                    <p style={{ fontSize: 11, color: '#92400E', margin: '4px 0 0' }}>Approval is Pending — your Service Manager will review your amendment.</p>
                  )}
                  {s.rejected && (
                    <p style={{ fontSize: 11, color: '#991B1B', margin: '4px 0 0' }}>Amendment rejected{s.approvedByName ? ` by ${s.approvedByName}` : ''} — you can request again.</p>
                  )}
                  {isPresent && s.amended && s.approvedByName && (
                    <p style={{ fontSize: 11, color: '#065F46', margin: '4px 0 0' }}>Approved by {s.approvedByName}</p>
                  )}
                  {s.kind === 'leave' && !s.pendingApproval && (
                    <>
                      <textarea value={amendReason} onChange={e => setAmendReason(e.target.value)} placeholder="Reason for amendment (required)" rows={3}
                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'none', boxSizing: 'border-box', marginTop: 10 }} />
                      {amendError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 6 }}>{amendError}</div>}
                      <button className="mtap" onClick={() => handleAmendSubmit(todayStr)} disabled={amendSubmitting}
                        style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #7D1D3F', background: '#fff', color: '#7D1D3F', fontSize: 13, fontWeight: 600, cursor: amendSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 8 }}>
                        {amendSubmitting ? 'Submitting…' : 'Request Amendment'}
                      </button>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 }}>Loading…</div>
        ) : (
          days.map(day => {
            const badge = getStatusBadge(day.status)
            const amendable = isAmendable(day)
            const expanded = expandedDate === day.date
            const s = day.status
            const hasReason = (s.kind === 'present' || s.kind === 'leave') && !!s.reason
            const hasRequested = s.kind === 'leave' && (s.pendingApproval || s.rejected) && !!s.markedAt
            const hasDecision = (s.kind === 'present' && s.amended) || (s.kind === 'leave' && s.rejected)
            const decisionLabel = s.kind === 'leave' && s.rejected ? 'Rejected' : 'Approved'
            return (
              <div
                key={day.date}
                className="mtap"
                onClick={() => toggleDay(day)}
                style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 8, cursor: amendable ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{formatDayLabel(day.date)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 20, padding: '3px 9px' }}>{badge.label}</span>
                </div>
                {hasRequested && s.markedAt && (
                  <div style={{ fontSize: 10, color: '#7A6870', marginTop: 6 }}>Requested: {formatDateTime(s.markedAt)}</div>
                )}
                {hasReason && (s.kind === 'present' || s.kind === 'leave') && (
                  <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>Reason: {s.reason}</div>
                )}
                {hasDecision && (s.kind === 'present' || s.kind === 'leave') && (
                  <>
                    {s.approvedByName && <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>{decisionLabel} by: {s.approvedByName}</div>}
                    {s.approvedAt && <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>{decisionLabel}: {formatDateTime(s.approvedAt)}</div>}
                  </>
                )}
                {amendable && !expanded && (
                  <div style={{ fontSize: 10, color: '#7D1D3F', marginTop: 6, fontWeight: 600 }}>Tap to request Present for this day →</div>
                )}
                {expanded && amendable && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #F5F3F5', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
                    <textarea
                      value={amendReason}
                      onChange={e => setAmendReason(e.target.value)}
                      placeholder="Reason (required)"
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'none', boxSizing: 'border-box' }}
                    />

                    {amendError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 8 }}>{amendError}</div>}

                    <button
                      className="mtap"
                      onClick={() => handleAmendSubmit(day.date)}
                      disabled={amendSubmitting}
                      style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: amendSubmitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 12, fontWeight: 600, cursor: amendSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 10 }}
                    >
                      {amendSubmitting ? 'Submitting…' : 'Submit for approval'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <BottomNav active="attendance" />
    </div>
  )
}
