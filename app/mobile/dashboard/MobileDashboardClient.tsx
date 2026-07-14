'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import MobileHeader from '@/components/mobile/MobileHeader'
import BottomNav from '@/components/mobile/BottomNav'
import JobCard from '@/components/mobile/JobCard'
import type { MobileWorkOrder, MobileDashboardStats } from '@/app/actions/mobile-actions'

interface Props {
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string } | null
  error: string | null
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

export default function MobileDashboardClient({ stats, recentJobs, engineer, error }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/mobile/login')
    router.refresh()
  }

  const firstName = engineer?.name?.split(' ')[0] || ''

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader
        title="EMR Global"
        subtitle={firstName ? `${greeting()}, ${firstName}` : undefined}
        rightSlot={
          <button
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
            <div style={{ fontSize: 12, color: '#7A6870', marginTop: 4 }}>No pending work orders assigned to you.</div>
          </div>
        )}

        {recentJobs.map(wo => <JobCard key={wo.id} wo={wo} />)}
      </div>

      <BottomNav active="dashboard" />
    </div>
  )
}
