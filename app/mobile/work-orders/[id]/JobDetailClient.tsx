'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MobileHeader from '@/components/mobile/MobileHeader'
import { JOB_TYPE_LABELS, STATUS_CONFIG } from '@/components/mobile/constants'
import type { MobileWorkOrderDetail } from '@/app/actions/mobile-actions'
import { getCheckInSyncStatus, clearCheckInSyncStatus, type CheckInSyncStatus } from '@/lib/mobile/backgroundCheckIn'

interface Props {
  detail: MobileWorkOrderDetail
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function JobDetailClient({ detail }: Props) {
  const router = useRouter()
  const { workOrder: wo } = detail
  const [checkInSync, setCheckInSync] = useState<CheckInSyncStatus | null>(null)

  useEffect(() => {
    router.prefetch(`/mobile/work-orders/${wo.id}/checkin`)
    router.prefetch(`/mobile/work-orders/${wo.id}/closure`)
    router.prefetch(`/mobile/work-orders/${wo.id}/form`)
  }, [router, wo.id])

  useEffect(() => {
    if (detail.hasCheckedIn) { clearCheckInSyncStatus(wo.id); return }
    const t = setTimeout(() => setCheckInSync(getCheckInSyncStatus(wo.id)), 0)

    function handleSync(e: Event) {
      const id = (e as CustomEvent<{ workOrderId: string }>).detail?.workOrderId
      if (id !== wo.id) return
      const next = getCheckInSyncStatus(wo.id)
      setCheckInSync(next)
      if (!next) router.refresh() // background check-in landed — pull the fresh hasCheckedIn state
    }
    window.addEventListener('emr-checkin-sync', handleSync)
    return () => { clearTimeout(t); window.removeEventListener('emr-checkin-sync', handleSync) }
  }, [wo.id, detail.hasCheckedIn, router])

  // Ever having gone pending puts "Pending" into the progression permanently for this
  // work order, even if the engineer has since checked back in and moved past it.
  const everPending = wo.status === 'pending' || wo.status === 'needs_reassignment' || detail.latestClosure?.outcome === 'pending'
  const STEP_ORDER: { key: string; label: string }[] = everPending
    ? [{ key: 'assigned', label: 'Assigned' }, { key: 'in_progress', label: 'In Progress' }, { key: 'pending', label: 'Pending' }, { key: 'completed', label: 'Closed' }]
    : [{ key: 'assigned', label: 'Assigned' }, { key: 'in_progress', label: 'In Progress' }, { key: 'completed', label: 'Closed' }]
  // needs_reassignment sits at the same stage as pending for the purposes of the bar —
  // it's a pending visit with an extra flag, not a further-along stage.
  const statusKey = wo.status === 'unassigned' ? 'assigned' : wo.status === 'needs_reassignment' ? 'pending' : wo.status
  const currentIndex = Math.max(0, STEP_ORDER.findIndex(s => s.key === statusKey))
  const steps = STEP_ORDER.map((s, i) => ({
    label: s.label,
    done: i < currentIndex || (i === currentIndex && s.key === 'completed'),
    pending: s.key === 'pending',
  }))

  const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned
  const isClosed = wo.status === 'completed'
  const needsReassignment = wo.status === 'needs_reassignment'

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function formatDateTime(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title={wo.wo_number} backHref="/mobile/jobs" rightSlot={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '3px 10px' }}>
            {st.label}
          </span>
          {(wo.status === 'pending' || wo.status === 'needs_reassignment') && detail.latestClosure?.revisitDate && (
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)' }}>
              Revisit: {formatDate(detail.latestClosure.revisitDate)}
            </span>
          )}
        </div>
      } />

      {/* Status progression */}
      <div style={{ background: '#3A0A1C', padding: '14px 16px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          Job status progression
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {steps.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, border: '2px solid rgba(255,255,255,0.2)',
                  background: step.done ? (step.pending ? '#D97706' : '#059669') : (i === currentIndex ? '#7D1D3F' : 'transparent'),
                  borderColor: step.done ? (step.pending ? '#D97706' : '#059669') : (i === currentIndex ? '#E8A0B8' : 'rgba(255,255,255,0.2)'),
                  boxShadow: i === currentIndex && !step.done ? '0 0 0 3px rgba(168,41,79,0.3)' : 'none',
                }}>
                  {step.done ? <CheckIcon /> : (
                    <span style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>{i + 1}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 8, marginTop: 4, textAlign: 'center', lineHeight: 1.2, maxWidth: 46,
                  color: step.done ? (step.pending ? '#FBBF24' : '#34D399') : (i === currentIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)'),
                  fontWeight: i === currentIndex ? 600 : 400,
                }}>
                  {step.label}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, margin: '0 2px', marginBottom: 12, background: steps[i + 1].done || step.done ? '#059669' : 'rgba(255,255,255,0.12)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action panel */}
      <div style={{ background: '#fff', margin: '10px 16px 0', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
        {!isClosed && !needsReassignment && wo.status === 'pending' && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: '#92400E', marginBottom: 10 }}>
            Marked pending{detail.latestClosure ? ' — ' + formatDate(detail.latestClosure.created_at) : ''}. Check in again to continue this visit.
          </div>
        )}
        {needsReassignment ? (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#9A3412' }}>
            This job is flagged for reassignment to a different engineer. It will reappear here once your supervisor assigns it to someone.
          </div>
        ) : isClosed ? (
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#065F46' }}>
            This visit is marked completed.
          </div>
        ) : checkInSync?.status === 'pending' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F9EEF2', border: '1px solid #E8C5D0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', border: '2px solid #E8C5D0', borderTopColor: '#7D1D3F',
              animation: 'checkinspin 0.7s linear infinite', flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#7D1D3F', margin: 0 }}>Checking in…</p>
              <span style={{ fontSize: 10, color: '#7A6870' }}>Syncing in the background — you can keep working</span>
            </div>
            <style>{`@keyframes checkinspin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : checkInSync?.status === 'error' ? (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', margin: '0 0 3px' }}>Check-in didn&apos;t sync</p>
            <p style={{ fontSize: 11, color: '#991B1B', margin: '0 0 8px' }}>{checkInSync.message}</p>
            <button
              className="mtap"
              onClick={() => router.push(`/mobile/work-orders/${wo.id}/checkin`)}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              Retry check-in
            </button>
          </div>
        ) : !detail.hasCheckedIn ? (
          <button
            className="mtap"
            onClick={() => router.push(`/mobile/work-orders/${wo.id}/checkin`)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#7D1D3F', border: 'none', borderRadius: 10, padding: '12px 14px', width: '100%', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            <div style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: 0 }}>Check in at site</p>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Capture GPS + photo to start work</span>
            </div>
          </button>
        ) : (
          <button
            className="mtap"
            onClick={() => router.push(`/mobile/work-orders/${wo.id}/closure`)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#7D1D3F', border: 'none', borderRadius: 10, padding: '12px 14px', width: '100%', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
          >
            <div style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: 0 }}>End of day closure</p>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Mark today&apos;s work complete or pending</span>
            </div>
          </button>
        )}

        <button
          className="mtap"
          onClick={() => router.push(`/mobile/work-orders/${wo.id}/form`)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
            padding: '9px 10px', borderRadius: 8, border: '1px solid #E5E0E3', background: '#F8F5F6',
            color: '#7A6870', fontSize: 11, fontWeight: 500, cursor: 'pointer', marginTop: 8,
            fontFamily: 'Poppins, sans-serif',
          }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          </svg>
          {detail.hasFormSubmission ? 'Review job form' : 'Fill job form'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Work order details</p>
          <InfoRow label="Work order" value={wo.wo_number} highlight />
          <InfoRow label="Job type" value={
            <span style={{ background: '#F9EEF2', color: '#7D1D3F', fontSize: 11, fontWeight: 500, borderRadius: 6, padding: '2px 9px' }}>
              {JOB_TYPE_LABELS[wo.job_type] || wo.job_type}
            </span>
          } />
          <InfoRow label="Serial number(s)" value={wo.serial_numbers.join(', ') || '—'} highlight />
          <InfoRow label="Scheduled date" value={formatDate(wo.scheduled_date)} last />
        </div>

        <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Customer information</p>
          <InfoRow label="Customer" value={wo.customer_name} />
          <InfoRow label="Contact" value={wo.customer_contact || '—'} />
          <InfoRow label="Phone" value={wo.customer_phone || '—'} />
          <InfoRow label="Site" value={wo.site_name || '—'} />
          <InfoRow label="Site address" value={wo.site_address || '—'} last />
        </div>

        {detail.handoverFromOtherEngineer && detail.latestClosure && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 13, padding: 13, marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#9A3412', marginBottom: 8 }}>
              Handed over from {detail.latestClosure.engineerName}
            </p>
            <InfoRow label="Last visited" value={formatDateTime(detail.latestClosure.created_at)} />
            <InfoRow label="Outcome" value={detail.latestClosure.outcome === 'completed' ? 'Completed' : detail.latestClosure.needsReassignment ? 'Needs reassignment' : 'Pending'} />
            {detail.latestClosure.pendingReason && <InfoRow label="Reason" value={detail.latestClosure.pendingReason} />}
            {detail.latestClosure.summary && (
              <div style={{ padding: '8px 0 0' }}>
                <div style={{ fontSize: 10, color: '#7A6870', marginBottom: 3 }}>Remarks from {detail.latestClosure.engineerName}</div>
                <div style={{ fontSize: 12, color: '#1C0D14' }}>{detail.latestClosure.summary}</div>
              </div>
            )}
            {detail.latestClosure.materialsRequired && (
              <div style={{ padding: '8px 0 0' }}>
                <div style={{ fontSize: 10, color: '#7A6870', marginBottom: 3 }}>Materials/parts requested</div>
                <div style={{ fontSize: 12, color: '#1C0D14' }}>{detail.latestClosure.materialsRequired}</div>
              </div>
            )}
            {detail.hasFormSubmission && (
              <button
                className="mtap"
                onClick={() => router.push(`/mobile/work-orders/${wo.id}/form`)}
                style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #FED7AA', background: '#fff', color: '#9A3412', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
              >
                View form entries filled by {detail.latestClosure.engineerName}
              </button>
            )}
          </div>
        )}

        {detail.hasCheckedIn && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, marginBottom: 10, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Check-in</p>
            <InfoRow label="Last checked in" value={formatDateTime(detail.lastCheckinAt)} last />
          </div>
        )}

        {detail.previousVisits.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 13, padding: 13, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14', marginBottom: 10 }}>Previous visits</p>
            {detail.previousVisits.map((v, i) => (
              <div key={i} style={{ background: '#F8F5F6', borderRadius: 8, padding: '8px 10px', marginBottom: i < detail.previousVisits.length - 1 ? 6 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#1C0D14' }}>{JOB_TYPE_LABELS[v.job_type] || v.job_type}</div>
                <div style={{ fontSize: 10, color: '#7A6870', marginTop: 2 }}>
                  {v.wo_number} · {formatDate(v.scheduled_date)} · {STATUS_CONFIG[v.status]?.label || v.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight, last }: { label: string; value: React.ReactNode; highlight?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: last ? 'none' : '1px solid #E5E0E3', fontSize: 12, gap: 10 }}>
      <span style={{ color: '#7A6870', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, color: highlight ? '#7D1D3F' : '#1C0D14', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
