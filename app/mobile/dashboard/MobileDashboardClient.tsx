'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MobileWorkOrder } from '@/app/actions/mobile-actions'

const JOB_TYPE_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning',
  supervision: 'Supervision',
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: 'Assigned',    bg: '#FEF3C7', color: '#92400E' },
  in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#1E40AF' },
  pending:     { label: 'Pending',     bg: '#FEF3C7', color: '#92400E' },
  unassigned:  { label: 'Unassigned',  bg: '#F3F4F6', color: '#6B7280' },
  completed:   { label: 'Completed',   bg: '#D1FAE5', color: '#065F46' },
}

interface Props {
  workOrders: MobileWorkOrder[]
  engineer: { name: string } | null
  error: string | null
}

export default function MobileDashboardClient({ workOrders, engineer, error }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/mobile/login')
    router.refresh()
  }

  function formatDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F5F6' }}>
      {/* Top bar */}
      <div style={{
        background: '#7D1D3F',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 2px 8px rgba(61,10,28,0.25)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9z"/>
            </svg>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>EMR Field</span>
          </div>
          {engineer && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              {engineer.name}
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8,
            padding: '7px 14px', fontSize: 12, color: '#fff', cursor: 'pointer',
            fontFamily: 'Poppins, sans-serif', fontWeight: 500,
          }}
        >
          Sign out
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px' }}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1C0D14', margin: 0 }}>My Work Orders</h2>
          <p style={{ fontSize: 12, color: '#7A6870', marginTop: 3 }}>
            {workOrders.length === 0 ? 'No pending work orders' : `${workOrders.length} pending`}
          </p>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {workOrders.length === 0 && !error && (
          <div style={{
            background: '#fff', borderRadius: 16, padding: '40px 24px',
            textAlign: 'center', border: '1px solid #E5E0E3',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1C0D14' }}>All caught up!</div>
            <div style={{ fontSize: 12, color: '#7A6870', marginTop: 4 }}>No pending work orders assigned to you.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workOrders.map(wo => {
            const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned
            return (
              <button
                key={wo.id}
                onClick={() => router.push(`/mobile/work-orders/${wo.id}`)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: '#fff', borderRadius: 16,
                  border: '1px solid #E5E0E3',
                  padding: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                {/* WO number + status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1C0D14' }}>{wo.wo_number}</div>
                    <div style={{ fontSize: 12, color: '#7A6870', marginTop: 2 }}>{wo.customer_name}</div>
                  </div>
                  <span style={{
                    background: st.bg, color: st.color,
                    fontSize: 11, fontWeight: 600, borderRadius: 20,
                    padding: '3px 10px', whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* Job type + date */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    background: '#F9EEF2', color: '#7D1D3F',
                    fontSize: 11, fontWeight: 500, borderRadius: 6,
                    padding: '3px 10px',
                  }}>
                    {JOB_TYPE_LABELS[wo.job_type] || wo.job_type}
                  </span>
                  {wo.scheduled_date && (
                    <span style={{ fontSize: 11, color: '#7A6870', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                      </svg>
                      {formatDate(wo.scheduled_date)}
                    </span>
                  )}
                </div>

                {/* Serial numbers */}
                {wo.serial_numbers.length > 0 && (
                  <div style={{ fontSize: 11, color: '#7A6870', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {wo.serial_numbers.map(sn => (
                      <span key={sn} style={{ background: '#F5F3F5', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>
                        {sn}
                      </span>
                    ))}
                  </div>
                )}

                {/* Chevron */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <svg width="16" height="16" fill="none" stroke="#7D1D3F" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
