'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import JobCard from '@/components/mobile/JobCard'
import PushSubscribe from '@/components/mobile/PushSubscribe'
import AccountMenu from '@/components/mobile/AccountMenu'
import { rescheduleFollowUp, recordLastSeen, setEngineerStatus, checkOpenVisitFollowUp, checkNotStartedFollowUp, logLocationPingIssue } from '@/app/actions/mobile-actions'
import type { MobileWorkOrder, MobileDashboardStats, OverdueFollowUp, EngineerStatusPrompt, EngineerStatusValue } from '@/lib/mobile/core/shared'
import type { AttendanceEffectiveStatus } from '@/lib/mobile/core/attendance'

interface Props {
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  attendanceStatus: AttendanceEffectiveStatus
  error: string | null
  overdueFollowUps: OverdueFollowUp[]
  statusPrompt: EngineerStatusPrompt | null
  unreadAlerts: number
}

// Orange while the 11am window is still open and nothing's marked, red once it's
// closed (or a late amendment is pending/rejected), green once present is confirmed.
// Holiday/Weekly Off get a neutral color — they're not an attendance outcome at all.
function attendanceCardStyle(status: AttendanceEffectiveStatus): { bg: string; color: string; label: string; sub: string | null } {
  switch (status.kind) {
    case 'pending':
      return { bg: '#FEF3C7', color: '#92400E', label: 'Mark attendance', sub: 'Before 11:00 AM' }
    case 'leave':
      return {
        bg: '#FEE2E2', color: '#991B1B', label: 'Leave',
        sub: status.pendingApproval ? 'Amendment pending approval' : status.rejected ? 'Amendment rejected' : 'Attendance not marked today',
      }
    case 'present':
      return { bg: '#D1FAE5', color: '#065F46', label: status.amended ? 'Present (amended)' : 'Present', sub: null }
    case 'holiday':
      return { bg: '#F1F5F9', color: '#475569', label: `Holiday`, sub: status.name }
    case 'weekly_off':
      return { bg: '#F1F5F9', color: '#475569', label: 'Weekly Off', sub: null }
    case 'not_applicable':
      return { bg: '#F1F5F9', color: '#475569', label: '—', sub: null }
  }
}

const STATUS_META: Record<EngineerStatusValue, { label: string; bg: string; color: string }> = {
  available: { label: 'Available', bg: '#D1FAE5', color: '#065F46' },
  on_leave: { label: 'On Leave', bg: '#F1F5F9', color: '#475569' },
  on_the_way: { label: 'On the way', bg: '#DBEAFE', color: '#1D4ED8' },
  travelling: { label: 'Travelling', bg: '#EDE9FE', color: '#5B21B6' },
  reached: { label: 'Reached project', bg: '#FEF3C7', color: '#92400E' },
  completed: { label: 'Completed', bg: '#D1FAE5', color: '#065F46' },
}

const STAT_CARDS: { key: keyof MobileDashboardStats; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
  {
    key: 'assigned', label: 'Assigned', color: '#2563EB', bg: '#DBEAFE',
    icon: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></>,
  },
  {
    key: 'inProgress', label: 'In Progress', color: '#D97706', bg: '#FEF3C7',
    icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  },
  {
    key: 'needsReassignment', label: 'Needs Reassignment', color: '#EA580C', bg: '#FED7AA',
    icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
  },
  {
    key: 'completed', label: 'Completed', color: '#059669', bg: '#D1FAE5',
    icon: <polyline points="20 6 9 17 4 12" />,
  },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getCurrentPositionAsync(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      // 8s -> 15s: field sites (substations, transformer yards) are exactly the kind
      // of metal/concrete environment where network-based location resolution is
      // slow — confirmed via logLocationPingIssue that the passive ping below was
      // timing out on a real device with permission genuinely granted.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    )
  })
}

export default function MobileDashboardClient({ stats, recentJobs, engineer, attendanceStatus, error, overdueFollowUps, statusPrompt, unreadAlerts }: Props) {
  const router = useRouter()
  const [queue, setQueue] = useState(overdueFollowUps)
  const [askingAtSite, setAskingAtSite] = useState<{ workOrderId: string; action: 'completed' | 'reschedule' } | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  // Defaults to today (not blank) — the field only accepts today-or-later (see
  // its `min` prop below), so the user adjusts a pre-filled date instead of
  // typing one from scratch.
  const [newDate, setNewDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [dateFocused, setDateFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rescheduleError, setRescheduleError] = useState('')

  const [currentStatus, setCurrentStatus] = useState<EngineerStatusValue>(statusPrompt?.currentStatus || 'available')
  const [showStatusModal, setShowStatusModal] = useState(!!statusPrompt?.needsPrompt)
  const [statusStep, setStatusStep] = useState<'choose' | 'pick-site'>('choose')
  const [pendingStatus, setPendingStatus] = useState<EngineerStatusValue | null>(null)
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('')
  const [startByTime, setStartByTime] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [notStartedNotice, setNotStartedNotice] = useState<{ projectLabel: string } | null>(null)
  const [notStartedDismissed, setNotStartedDismissed] = useState(false)
  const [locationBlocked, setLocationBlocked] = useState(false)
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false)

  // Passive "last seen" location — a best-effort ping on app open, silently ignored
  // if permission is denied or unavailable. Not the same as job check-in GPS. Reused
  // (not a second geolocation request) to also check whether the engineer committed to
  // an "I will start by ___" time (see setEngineerStatus) that's now passed while
  // they're still where they were when they set the status.
  useEffect(() => {
    if (!navigator.geolocation) { logLocationPingIssue('navigator.geolocation unavailable').catch(() => {}); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        recordLastSeen(latitude, longitude).catch(() => {})
        checkNotStartedFollowUp(latitude, longitude).then(({ notice }) => {
          if (notice) setNotStartedNotice(notice)
        }).catch(() => {})
      },
      err => {
        // GeolocationPositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
        // 3 = TIMEOUT. Was previously a silent no-op — with a field engineer reporting
        // permission was granted but "Last seen" never updates, this is the only way to
        // tell which of the three is actually happening on their device.
        logLocationPingIssue(`code=${err.code} message=${err.message}`).catch(() => {})
        if (err.code === 1) setLocationBlocked(true)
      },
      // timeout bumped from 8s to 20s — confirmed via logLocationPingIssue that this was
      // timing out (code=3) on at least one real device, not a permission denial (code=1).
      // Field sites (substations, transformer yards) are exactly the kind of metal/concrete
      // environment where network-based location takes longer to resolve; this is a passive
      // background ping with no UI to block, so a longer timeout has no real downside.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  // Same-day complement to the date-based overdueFollowUps prompt: on every app open,
  // check whether the engineer is still "reached" at a job with no closure since —
  // independent of location/GPS, so it doesn't wait on or depend on geolocation.
  useEffect(() => {
    checkOpenVisitFollowUp().then(({ followUp }) => {
      if (!followUp) return
      setQueue(q => q.some(f => f.workOrderId === followUp.workOrderId) ? q : [...q, followUp])
    }).catch(() => {})
  }, [])

  function openStatusModal() {
    setStatusStep('choose')
    setPendingStatus(null)
    setSelectedWorkOrderId('')
    setStartByTime('')
    setStatusError('')
    setShowStatusModal(true)
  }

  function chooseStatus(status: EngineerStatusValue) {
    if (status === 'on_the_way' || status === 'travelling') {
      setPendingStatus(status)
      setStatusStep('pick-site')
      return
    }
    confirmStatus(status, null)
  }

  async function confirmStatus(status: EngineerStatusValue, workOrderId: string | null) {
    const isTravelStatus = status === 'on_the_way' || status === 'travelling'
    if (isTravelStatus && !workOrderId) {
      setStatusError('Pick a project')
      return
    }
    if (isTravelStatus && !startByTime) {
      setStatusError('Pick a start time')
      return
    }
    setStatusSaving(true)
    setStatusError('')
    const loc = isTravelStatus ? await getCurrentPositionAsync() : null
    const result = await setEngineerStatus(status, workOrderId, isTravelStatus ? startByTime : null, loc?.lat ?? null, loc?.lng ?? null)
    setStatusSaving(false)
    if (result.error) { setStatusError(result.error); return }
    setCurrentStatus(status)
    setShowStatusModal(false)
    setNotStartedNotice(null)
    setNotStartedDismissed(false)
  }

  const statusSite = statusPrompt?.assignableSites.find(s => s.workOrderId === selectedWorkOrderId)

  function dismiss(workOrderId: string) {
    setQueue(q => q.filter(f => f.workOrderId !== workOrderId))
    setAskingAtSite(null)
    setReschedulingId(null)
    setNewDate('')
    setRescheduleError('')
  }

  async function confirmReschedule(workOrderId: string) {
    if (!newDate) { setRescheduleError('Pick a new follow-up date'); return }
    setSaving(true)
    setRescheduleError('')
    // Reaching this sub-flow always means the engineer answered "No, I've left" to the
    // are-you-at-the-site prompt (the only way reschedulingId gets set) — always flag
    // as an off-site update.
    const result = await rescheduleFollowUp(workOrderId, newDate, true)
    setSaving(false)
    if (result.error) { setRescheduleError(result.error); return }
    dismiss(workOrderId)
  }

  const firstName = engineer?.name?.split(' ')[0] || ''
  const current = queue[0]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      {showStatusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,20,0.55)', zIndex: 51, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '18px 18px 0 0', padding: 20, width: '100%', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
            {statusStep === 'choose' ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#7D1D3F', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Set your status
                </div>
                <p style={{ fontSize: 12, color: '#7A6870', margin: '0 0 16px' }}>
                  Let your supervisor know where you are before you start your day.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {(['available', 'on_the_way', 'travelling', 'on_leave'] as EngineerStatusValue[]).map(s => (
                    <button
                      key={s}
                      className="mtap"
                      onClick={() => chooseStatus(s)}
                      disabled={statusSaving}
                      style={{
                        padding: '14px 10px', borderRadius: 12, border: `1.5px solid ${STATUS_META[s].color}22`,
                        background: STATUS_META[s].bg, color: STATUS_META[s].color, fontSize: 13, fontWeight: 600,
                        cursor: statusSaving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif',
                      }}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
                {statusError && <p style={{ fontSize: 11, color: '#DC2626', margin: '4px 0 0' }}>{statusError}</p>}
              </>
            ) : (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#7D1D3F', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  {pendingStatus === 'travelling' ? 'Travelling to' : 'On the way to'}
                </div>
                <p style={{ fontSize: 12, color: '#7A6870', margin: '0 0 12px' }}>Pick which project.</p>
                {statusPrompt && statusPrompt.assignableSites.length > 0 ? (
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
                    {statusPrompt.assignableSites.map(s => (
                      <label
                        key={s.workOrderId}
                        className="mtap"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', marginBottom: 6,
                          borderRadius: 10, border: `1.5px solid ${selectedWorkOrderId === s.workOrderId ? '#7D1D3F' : '#E5E0E3'}`,
                          background: selectedWorkOrderId === s.workOrderId ? '#F9EEF2' : '#fff', cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          checked={selectedWorkOrderId === s.workOrderId}
                          onChange={() => setSelectedWorkOrderId(s.workOrderId)}
                          style={{ accentColor: '#7D1D3F', width: 16, height: 16, flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{s.siteName}</div>
                          <div style={{ fontSize: 10, color: '#7A6870' }}>{s.woNumber}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#7A6870', marginBottom: 12 }}>No assigned jobs to pick a project from.</p>
                )}

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A6870', marginBottom: 6 }}>
                  I will start by
                </label>
                <input
                  type="time"
                  value={startByTime}
                  onChange={e => setStartByTime(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid #E5E0E3', borderRadius: 10,
                    fontSize: 14, fontWeight: 500, color: '#1C0D14', outline: 'none',
                    fontFamily: 'Poppins, sans-serif', marginBottom: 12, boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 10, color: '#7A6870', margin: '-6px 0 12px' }}>
                  If you&apos;re still in the same place after this time, your supervisor will be able to see you haven&apos;t started.
                </p>

                {statusError && <p style={{ fontSize: 11, color: '#DC2626', margin: '0 0 10px' }}>{statusError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="mtap"
                    onClick={() => setStatusStep('choose')}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    Back
                  </button>
                  <button
                    className="mtap"
                    onClick={() => pendingStatus && confirmStatus(pendingStatus, selectedWorkOrderId || null)}
                    disabled={statusSaving || !selectedWorkOrderId || !startByTime}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: (statusSaving || !selectedWorkOrderId || !startByTime) ? '#C9A3B5' : '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (statusSaving || !selectedWorkOrderId || !startByTime) ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    {statusSaving ? 'Saving…' : statusSite ? `Confirm — ${statusSite.siteName}` : 'Confirm'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!showStatusModal && current && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,20,0.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '18px 18px 0 0', padding: 20, width: '100%', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              {current.kind === 'open_checkin' ? 'Visit not closed out' : 'Follow-up overdue'}
            </div>
            <p style={{ fontSize: 13, color: '#1C0D14', margin: '0 0 4px', fontWeight: 600 }}>{current.customerName}</p>
            <p style={{ fontSize: 12, color: '#7A6870', margin: '0 0 16px' }}>
              {current.kind === 'pending'
                ? <>{current.woNumber} was due for a follow-up on {formatDate(current.dueDate)}. Is this job completed, or do you need to reschedule?</>
                : current.kind === 'open_checkin'
                  ? <>You&apos;re still checked in for {current.woNumber} and it hasn&apos;t been closed out. Is this job completed, or do you still need more time?</>
                  : <>{current.woNumber} has been in progress since your last check-in on {formatDate(current.dueDate)}, with no update since. Is this job completed, or do you need to reschedule?</>}
            </p>

            {askingAtSite?.workOrderId === current.workOrderId ? (
              <>
                <p style={{ fontSize: 12, color: '#7A6870', margin: '0 0 12px' }}>
                  Are you still at the site right now?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="mtap"
                    onClick={() => setAskingAtSite(null)}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    Back
                  </button>
                  <button
                    className="mtap"
                    onClick={() => {
                      if (askingAtSite.action === 'reschedule') { setAskingAtSite(null); setReschedulingId(current.workOrderId); setNewDate(new Date().toLocaleDateString('en-CA')) }
                      else router.push(`/mobile/work-orders/${current.workOrderId}/closure?offsite=1`)
                    }}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    No, I&apos;ve left
                  </button>
                  <button
                    className="mtap"
                    onClick={() => router.push(`/mobile/work-orders/${current.workOrderId}/closure`)}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    Yes, I&apos;m here
                  </button>
                </div>
              </>
            ) : reschedulingId === current.workOrderId ? (
              <>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7A6870', marginBottom: 6 }}>
                  New follow-up date
                </label>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dateFocused ? '#7D1D3F' : '#B7A8AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  >
                    <rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <input
                    type="date"
                    className="emr-premium-date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    onFocus={() => setDateFocused(true)}
                    onBlur={() => setDateFocused(false)}
                    min={new Date().toLocaleDateString('en-CA')}
                    style={{
                      width: '100%', padding: '13px 14px 13px 40px', border: `1.5px solid ${dateFocused ? '#7D1D3F' : '#E5E0E3'}`,
                      borderRadius: 12, fontSize: 13, fontWeight: 500, color: '#1C0D14', outline: 'none',
                      fontFamily: 'Poppins, sans-serif', background: dateFocused ? '#fff' : '#FAF7F8', boxSizing: 'border-box',
                      boxShadow: dateFocused ? '0 0 0 3px rgba(125,29,63,0.12)' : 'none', transition: 'all .15s',
                    }}
                  />
                  <style>{`
                    .emr-premium-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.65; padding: 4px; border-radius: 6px; }
                    .emr-premium-date::-webkit-calendar-picker-indicator:hover { opacity: 1; background: #F9EEF2; }
                  `}</style>
                </div>
                {rescheduleError && <p style={{ fontSize: 11, color: '#DC2626', margin: '0 0 10px' }}>{rescheduleError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="mtap"
                    onClick={() => { setReschedulingId(null); setRescheduleError('') }}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#7A6870', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    Back
                  </button>
                  <button
                    className="mtap"
                    onClick={() => confirmReschedule(current.workOrderId)}
                    disabled={saving}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: saving ? '#A8294F' : '#7D1D3F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}
                  >
                    {saving ? 'Saving…' : 'Confirm new date'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="mtap"
                  onClick={() => setAskingAtSite({ workOrderId: current.workOrderId, action: 'reschedule' })}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                >
                  Reschedule
                </button>
                <button
                  className="mtap"
                  onClick={() => setAskingAtSite({ workOrderId: current.workOrderId, action: 'completed' })}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                >
                  Job completed
                </button>
              </div>
            )}

            <button
              className="mtap"
              onClick={() => dismiss(current.workOrderId)}
              style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', fontSize: 11, color: '#7A6870', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              Remind me later
            </button>
          </div>
        </div>
      )}

      <MobileHeader
        title="EMR Global"
        subtitle={firstName ? `${greeting()}, ${firstName}` : undefined}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="mtap"
              onClick={() => router.push('/mobile/alerts')}
              style={{
                position: 'relative', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8,
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              {unreadAlerts > 0 && (
                <div style={{ position: 'absolute', top: 3, right: 3, minWidth: 13, height: 13, padding: '0 2px', background: '#A8294F', borderRadius: 7, border: '1.5px solid #3A0A1C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: '#fff' }}>
                  {unreadAlerts > 9 ? '9+' : unreadAlerts}
                </div>
              )}
            </button>
            <AccountMenu />
          </div>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {locationBlocked && !locationBannerDismissed && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#991B1B', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                Location access is blocked
              </p>
              <button
                className="mtap"
                onClick={() => setLocationBannerDismissed(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#991B1B', margin: 0, lineHeight: 1.5 }}>
              Your supervisor won&apos;t be able to see your last-seen location until you allow it. Open your browser&apos;s Site settings for this app, set Location to Allow, then reload the page.
            </p>
          </div>
        )}

        <PushSubscribe />

        {notStartedNotice && !notStartedDismissed && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                You committed to a start time for {notStartedNotice.projectLabel}, but your location hasn&apos;t changed — your supervisor will be able to see you haven&apos;t started yet.
              </p>
              <button
                className="mtap"
                onClick={() => setNotStartedDismissed(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}
              >
                ×
              </button>
            </div>
            <button
              className="mtap"
              onClick={openStatusModal}
              style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8, border: 'none', background: '#92400E', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              Update status
            </button>
          </div>
        )}

        <button
          className="mtap"
          onClick={openStatusModal}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '6px 12px 6px 6px',
            borderRadius: 20, border: 'none', background: STATUS_META[currentStatus].bg, cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_META[currentStatus].color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_META[currentStatus].color }}>{STATUS_META[currentStatus].label}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={STATUS_META[currentStatus].color} strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {(() => {
          const cfg = attendanceCardStyle(attendanceStatus)
          const clickable = attendanceStatus.kind === 'pending' || attendanceStatus.kind === 'leave'
          return (
            <button
              className="mtap"
              onClick={() => clickable && router.push('/mobile/attendance')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                marginBottom: 12, padding: '13px 14px', borderRadius: 12, border: 'none',
                background: cfg.bg, cursor: clickable ? 'pointer' : 'default', fontFamily: 'Poppins, sans-serif', textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, opacity: 0.75 }}>Attendance</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                {cfg.sub && <div style={{ fontSize: 10, color: cfg.color, opacity: 0.8, marginTop: 1 }}>{cfg.sub}</div>}
              </div>
              {clickable && (
                <svg width="14" height="14" fill="none" stroke={cfg.color} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              )}
            </button>
          )
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 }}>
          {STAT_CARDS.map(card => (
            <button
              key={card.key}
              className="mtap"
              onClick={() => router.push('/mobile/jobs')}
              style={{
                background: '#fff', borderRadius: 12, padding: 12, textAlign: 'left',
                border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(125,29,63,0.05)',
                borderTop: `3px solid ${card.color}`, fontFamily: 'Poppins, sans-serif',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9, background: card.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7,
              }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round">
                  {card.icon}
                </svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1C0D14', lineHeight: 1 }}>{stats[card.key]}</div>
              <div style={{ fontSize: 10, color: '#7A6870', marginTop: 3, fontWeight: 500 }}>{card.label}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#7A6870', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
            Your next jobs
          </p>
          <button
            className="mtap"
            onClick={() => router.push('/mobile/jobs')}
            style={{ background: 'none', border: 'none', fontSize: 11, color: '#7D1D3F', fontWeight: 500, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            View all →
          </button>
        </div>

        {recentJobs.length === 0 && !error && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1C0D14' }}>All caught up!</div>
            <div style={{ fontSize: 12, color: '#7A6870', marginTop: 4 }}>No pending notifications assigned to you.</div>
          </div>
        )}

        {recentJobs.map(wo => <JobCard key={wo.id} wo={wo} />)}
      </div>

      <BottomNav active="dashboard" />
    </div>
  )
}
