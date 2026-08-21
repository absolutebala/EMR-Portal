'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { reverseGeocode } from '@/app/actions/mobile-actions'
import { markAttendance, getAttendanceCalendar } from '@/app/actions/attendance'
import type { AttendanceCalendarDay, AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'

interface Props {
  initialDays: AttendanceCalendarDay[]
  initialError: string | null
  todayStr: string
}

function getStatusBadge(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string } {
  switch (status.kind) {
    case 'present': return { bg: '#D1FAE5', color: '#065F46', label: status.amended ? 'Present (amended)' : 'Present' }
    case 'leave': return { bg: '#FEE2E2', color: '#991B1B', label: status.pendingApproval ? 'Leave — pending approval' : status.rejected ? 'Leave — amendment rejected' : 'Leave' }
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
    case 'present': return s.amended ? 'Present (amended)' : 'Present'
    case 'leave': return s.rejected ? 'Leave (amendment rejected)' : s.pendingApproval ? 'Leave (pending approval)' : 'Leave'
    case 'holiday': return `Holiday: ${s.name}`
    case 'weekly_off': return 'Weekly Off'
    case 'pending': return 'Pending'
    case 'not_applicable': return '—'
  }
}

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
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

function exportDaysToXlsx(exportDays: AttendanceCalendarDay[], filenameSuffix: string) {
  const headers = ['Date', 'Status', 'Marked At', 'Reason']
  const aoa = [headers, ...exportDays.map(d => {
    const markedAt = d.markedAt ? new Date(d.markedAt).toLocaleString('en-IN') : (d.status.kind === 'leave' ? '11:00 AM' : '')
    const reason = d.status.kind === 'present' || d.status.kind === 'leave' ? (d.status.reason || '') : ''
    return [d.date, attendanceLabel(d.status), markedAt, reason]
  })]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = headers.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
  XLSX.writeFile(wb, `attendance_${filenameSuffix}.xlsx`)
}

export default function AttendanceView({ initialDays, initialError, todayStr }: Props) {
  // Anchored to the server-provided IST "today" (not a fresh client Date()) so the
  // initial week matches exactly what page.tsx already fetched.
  const [anchorDate, setAnchorDate] = useState(() => new Date(`${todayStr}T00:00:00`))
  const [days, setDays] = useState(initialDays)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const isFirstRun = useRef(true)

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [gpsRequested, setGpsRequested] = useState(false)
  const [gpsResolved, setGpsResolved] = useState(false)
  const [reason, setReason] = useState('')
  const [markError, setMarkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState<'pending' | 'approval' | null>(null)

  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [amendCoords, setAmendCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [amendPlaceName, setAmendPlaceName] = useState('')
  const [amendGpsError, setAmendGpsError] = useState('')
  const [amendGpsRequested, setAmendGpsRequested] = useState(false)
  const [amendGpsResolved, setAmendGpsResolved] = useState(false)
  const [amendReason, setAmendReason] = useState('')
  const [amendError, setAmendError] = useState('')
  const [amendSubmitting, setAmendSubmitting] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const range = weekRange(anchorDate)

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

  const todayEntry = days.find(d => d.date === todayStr) ?? null
  const todayStatus = todayEntry?.status ?? null
  const needsMarking = !justSubmitted && (todayStatus?.kind === 'pending' || todayStatus?.kind === 'leave')
  const isLate = todayStatus?.kind === 'leave'
  const isPendingApproval = todayStatus?.kind === 'leave' && todayStatus.pendingApproval

  function goPrev() { setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function goNext() { setAnchorDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }

  function startGpsCapture() {
    setGpsRequested(true)
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

  async function handleMark() {
    setMarkError('')
    if (isLate && !reason.trim()) {
      setMarkError('Please give a reason for marking attendance after 11:00 AM')
      return
    }
    setSubmitting(true)
    const result = await markAttendance({
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      placeName: placeName || null,
      reason: isLate ? reason.trim() : null,
    })
    setSubmitting(false)
    if (result.error) { setMarkError(result.error); return }
    setJustSubmitted(result.needsApproval ? 'approval' : 'pending')
    load(range.from, range.to)
  }

  function isAmendable(day: AttendanceCalendarDay): boolean {
    return day.status.kind === 'leave' && !day.status.pendingApproval
      && day.date !== todayStr && day.date.slice(0, 7) === todayStr.slice(0, 7)
  }

  function toggleDay(day: AttendanceCalendarDay) {
    if (!isAmendable(day)) return
    if (expandedDate === day.date) { setExpandedDate(null); return }
    setExpandedDate(day.date)
    setAmendCoords(null); setAmendPlaceName(''); setAmendGpsError('')
    setAmendGpsRequested(false); setAmendGpsResolved(false); setAmendReason(''); setAmendError('')
  }

  function startAmendGpsCapture() {
    setAmendGpsRequested(true)
    setAmendGpsError('')
    if (!('geolocation' in navigator)) {
      setAmendGpsResolved(true)
      setAmendGpsError('GPS not available on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setAmendCoords(c)
        setAmendGpsResolved(true)
        reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setAmendPlaceName(label) })
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            setAmendCoords(c)
            setAmendGpsResolved(true)
            reverseGeocode(c.lat, c.lng).then(({ label }) => { if (label) setAmendPlaceName(label) })
          },
          () => { setAmendGpsResolved(true); setAmendGpsError('Could not get location — you can still submit without it') },
          { enableHighAccuracy: false, timeout: 10000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  async function handleAmendSubmit(dateStr: string) {
    setAmendError('')
    if (!amendReason.trim()) {
      setAmendError('Please give a reason for this amendment')
      return
    }
    setAmendSubmitting(true)
    const result = await markAttendance({
      latitude: amendCoords?.lat ?? null,
      longitude: amendCoords?.lng ?? null,
      placeName: amendPlaceName || null,
      reason: amendReason.trim(),
      attendanceDate: dateStr,
    })
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
      exportDaysToXlsx(d, `${range.from}_to_${range.to}`)
    })
  }

  function handleExportMonth() {
    const { from, to } = monthRangeFor(todayStr)
    setExporting(true)
    setExportError('')
    getAttendanceCalendar(from, to).then(({ days: d, error: err }) => {
      setExporting(false)
      if (err) { setExportError(err); return }
      exportDaysToXlsx(d, `month_${from.slice(0, 7)}`)
    })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Attendance" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 100 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            className="mtap"
            onClick={goPrev}
            aria-label="Previous week"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E0E3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="14" height="14" fill="none" stroke="#1C0D14" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14' }}>{range.label}</span>
          <button
            className="mtap"
            onClick={goNext}
            aria-label="Next week"
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E0E3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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

        {needsMarking && todayStatus && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 16, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14', margin: '0 0 4px' }}>
              {todayStatus.kind === 'pending' ? "Mark today's attendance" : 'Request to mark today present'}
            </p>
            {isLate && (
              <p style={{ fontSize: 11, color: '#7A6870', lineHeight: 1.5, margin: '0 0 10px' }}>
                {isPendingApproval
                  ? "Your amendment request is pending your Service Manager's approval."
                  : todayStatus.kind === 'leave' && todayStatus.rejected
                    ? 'Your previous request was rejected — you can submit again with a new reason.'
                    : "The 11:00 AM window has passed — this will need your Service Manager's approval."}
              </p>
            )}

            {!isPendingApproval && (
              <>
                {!gpsRequested ? (
                  <button
                    className="mtap"
                    onClick={startGpsCapture}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 4 }}
                  >
                    Capture location &amp; continue
                  </button>
                ) : (
                  <div style={{ background: coords ? 'linear-gradient(135deg,#065F46,#059669)' : gpsResolved ? '#B91C1C' : 'linear-gradient(135deg,#1E3A5F,#2563EB)', borderRadius: 10, padding: 12, textAlign: 'center', marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                      {coords ? (placeName || 'GPS location captured') : gpsResolved ? (gpsError || 'GPS unavailable') : 'GPS location capturing…'}
                    </div>
                  </div>
                )}

                {gpsRequested && isLate && (
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason (required)"
                    rows={3}
                    style={{ width: '100%', marginTop: 10, padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'none', boxSizing: 'border-box' }}
                  />
                )}

                {markError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 8 }}>{markError}</div>}

                {gpsRequested && gpsResolved && (
                  <button
                    className="mtap"
                    onClick={handleMark}
                    disabled={submitting}
                    style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: submitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 10 }}
                  >
                    {submitting ? 'Saving…' : isLate ? 'Submit for approval' : 'Mark present'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 }}>Loading…</div>
        ) : (
          days.map(day => {
            const badge = getStatusBadge(day.status)
            const amendable = isAmendable(day)
            const expanded = expandedDate === day.date
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
                {day.status.kind === 'present' && day.status.reason && (
                  <div style={{ fontSize: 10, color: '#7A6870', marginTop: 6 }}>Reason: {day.status.reason}</div>
                )}
                {day.status.kind === 'leave' && day.status.rejected && day.date !== todayStr && (
                  <div style={{ fontSize: 10, color: '#B91C1C', marginTop: 6 }}>Previous request rejected — you can resubmit.</div>
                )}
                {amendable && !expanded && (
                  <div style={{ fontSize: 10, color: '#7D1D3F', marginTop: 6, fontWeight: 600 }}>Tap to request Present for this day →</div>
                )}
                {expanded && amendable && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #F5F3F5', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
                    {!amendGpsRequested ? (
                      <button
                        className="mtap"
                        onClick={startAmendGpsCapture}
                        style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                      >
                        Capture location &amp; continue
                      </button>
                    ) : (
                      <div style={{ background: amendCoords ? 'linear-gradient(135deg,#065F46,#059669)' : amendGpsResolved ? '#B91C1C' : 'linear-gradient(135deg,#1E3A5F,#2563EB)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                          {amendCoords ? (amendPlaceName || 'GPS location captured') : amendGpsResolved ? (amendGpsError || 'GPS unavailable') : 'GPS location capturing…'}
                        </div>
                      </div>
                    )}

                    {amendGpsRequested && (
                      <textarea
                        value={amendReason}
                        onChange={e => setAmendReason(e.target.value)}
                        placeholder="Reason (required)"
                        rows={3}
                        style={{ width: '100%', marginTop: 10, padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', resize: 'none', boxSizing: 'border-box' }}
                      />
                    )}

                    {amendError && <div style={{ color: '#DC2626', fontSize: 11, marginTop: 8 }}>{amendError}</div>}

                    {amendGpsRequested && amendGpsResolved && (
                      <button
                        className="mtap"
                        onClick={() => handleAmendSubmit(day.date)}
                        disabled={amendSubmitting}
                        style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: amendSubmitting ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 12, fontWeight: 600, cursor: amendSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', marginTop: 10 }}
                      >
                        {amendSubmitting ? 'Submitting…' : 'Submit for approval'}
                      </button>
                    )}
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
