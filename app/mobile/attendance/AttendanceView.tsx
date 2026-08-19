'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import { reverseGeocode } from '@/app/actions/mobile-actions'
import { markAttendance } from '@/app/actions/attendance'
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

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function AttendanceView({ initialDays: days, initialError: error, todayStr }: Props) {
  const router = useRouter()
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [placeName, setPlaceName] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [gpsRequested, setGpsRequested] = useState(false)
  const [gpsResolved, setGpsResolved] = useState(false)
  const [reason, setReason] = useState('')
  const [markError, setMarkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState<'pending' | 'approval' | null>(null)

  const todayEntry = days.find(d => d.date === todayStr) ?? null
  const todayStatus = todayEntry?.status ?? null
  const needsMarking = !justSubmitted && (todayStatus?.kind === 'pending' || todayStatus?.kind === 'leave')
  const isLate = todayStatus?.kind === 'leave'
  const isPendingApproval = todayStatus?.kind === 'leave' && todayStatus.pendingApproval

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
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title="Attendance" backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 100 }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>
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

        <p style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14', margin: '0 0 10px' }}>Last 7 days</p>
        {[...days].reverse().map(day => {
          const badge = getStatusBadge(day.status)
          const expanded = expandedDate === day.date
          return (
            <div
              key={day.date}
              className="mtap"
              onClick={() => setExpandedDate(expanded ? null : day.date)}
              style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 8, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{formatDayLabel(day.date)}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 20, padding: '3px 9px' }}>{badge.label}</span>
              </div>
              {day.status.kind === 'present' && day.status.reason && (
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 6 }}>Reason: {day.status.reason}</div>
              )}
              {expanded && (
                <div style={{ marginTop: 10, borderTop: '1px solid #F5F3F5', paddingTop: 8 }}>
                  {day.activity.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>No notification activity this day</div>
                  ) : (
                    day.activity.map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: 11, color: '#374151', flex: 1, marginRight: 8 }}>{a.action}</span>
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>{new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BottomNav active="attendance" />
    </div>
  )
}
