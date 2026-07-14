'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { JOB_TYPE_LABELS, STATUS_CONFIG } from './constants'
import type { MobileWorkOrder } from '@/app/actions/mobile-actions'

const BAR_COLOR: Record<string, string> = {
  assigned: '#2563EB',
  in_progress: '#D97706',
  pending: '#DC2626',
  unassigned: '#94A3B8',
  completed: '#059669',
}

export default function JobCard({ wo }: { wo: MobileWorkOrder }) {
  const router = useRouter()
  const st = STATUS_CONFIG[wo.status] || STATUS_CONFIG.assigned

  useEffect(() => {
    router.prefetch(`/mobile/work-orders/${wo.id}`)
  }, [router, wo.id])

  function formatDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <button
      className="mtap"
      onClick={() => router.push(`/mobile/work-orders/${wo.id}`)}
      style={{
        width: '100%', textAlign: 'left', display: 'flex',
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(125,29,63,0.08)', border: 'none', cursor: 'pointer',
        marginBottom: 9, padding: 0, fontFamily: 'Poppins, sans-serif',
      }}
    >
      <div style={{ width: 4, flexShrink: 0, background: BAR_COLOR[wo.status] || '#94A3B8' }} />
      <div style={{ flex: 1, padding: '11px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1C0D14' }}>{wo.customer_name}</div>
            <div style={{ fontSize: 10, color: '#7A6870', marginTop: 1 }}>
              {wo.wo_number} · {JOB_TYPE_LABELS[wo.job_type] || wo.job_type}
            </div>
          </div>
          <span style={{
            background: st.bg, color: st.color, fontSize: 10, fontWeight: 600,
            borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8,
          }}>
            {st.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {wo.site_name && (
            <span style={{ fontSize: 10, color: '#7A6870', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {wo.site_name}
            </span>
          )}
          {wo.serial_numbers.map(sn => (
            <span key={sn} style={{ fontSize: 10, color: '#7A6870', background: '#F5F3F5', borderRadius: 4, padding: '1px 6px', fontWeight: 500 }}>
              {sn}
            </span>
          ))}
          {wo.scheduled_date && (
            <span style={{ fontSize: 10, color: '#7A6870' }}>{formatDate(wo.scheduled_date)}</span>
          )}
        </div>
      </div>
    </button>
  )
}
