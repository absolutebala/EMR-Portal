'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import JobCard from '@/components/mobile/JobCard'
import { rescheduleFollowUp } from '@/app/actions/mobile-actions'
import type { MobileWorkOrder, MobileDashboardStats, OverdueFollowUp } from '@/app/actions/mobile-actions'

interface Props {
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  error: string | null
  overdueFollowUps: OverdueFollowUp[]
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
    key: 'pending', label: 'Pending', color: '#DC2626', bg: '#FEE2E2',
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

export default function MobileDashboardClient({ stats, recentJobs, engineer, error, overdueFollowUps }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [queue, setQueue] = useState(overdueFollowUps)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [rescheduleError, setRescheduleError] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/mobile/login')
    router.refresh()
  }

  function dismiss(workOrderId: string) {
    setQueue(q => q.filter(f => f.workOrderId !== workOrderId))
    setReschedulingId(null)
    setNewDate('')
    setRescheduleError('')
  }

  async function confirmReschedule(workOrderId: string) {
    if (!newDate) { setRescheduleError('Pick a new follow-up date'); return }
    setSaving(true)
    setRescheduleError('')
    const result = await rescheduleFollowUp(workOrderId, newDate)
    setSaving(false)
    if (result.error) { setRescheduleError(result.error); return }
    dismiss(workOrderId)
  }

  const firstName = engineer?.name?.split(' ')[0] || ''
  const current = queue[0]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      {current && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,20,0.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '18px 18px 0 0', padding: 20, width: '100%', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Follow-up overdue
            </div>
            <p style={{ fontSize: 13, color: '#1C0D14', margin: '0 0 4px', fontWeight: 600 }}>{current.customerName}</p>
            <p style={{ fontSize: 12, color: '#7A6870', margin: '0 0 16px' }}>
              {current.kind === 'pending'
                ? <>{current.woNumber} was due for a follow-up on {formatDate(current.dueDate)}. Is this job completed, or do you need to reschedule?</>
                : <>{current.woNumber} has been in progress since your last check-in on {formatDate(current.dueDate)}, with no update since. Is this job completed, or do you need to reschedule?</>}
            </p>

            {reschedulingId === current.workOrderId ? (
              <>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  min={new Date().toLocaleDateString('en-CA')}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E0E3', borderRadius: 10, fontSize: 12, color: '#1C0D14', outline: 'none', fontFamily: 'Poppins, sans-serif', background: '#fff', boxSizing: 'border-box', marginBottom: 10 }}
                />
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
                  onClick={() => setReschedulingId(current.workOrderId)}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E5E0E3', background: '#fff', color: '#1C0D14', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                >
                  Reschedule
                </button>
                <button
                  className="mtap"
                  onClick={() => router.push(`/mobile/work-orders/${current.workOrderId}`)}
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
          <button
            className="mtap"
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8,
              padding: '7px 12px', fontSize: 11, color: '#fff', cursor: 'pointer',
              fontFamily: 'Poppins, sans-serif', fontWeight: 500,
            }}
          >
            Sign out
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

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
            Recent jobs
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
