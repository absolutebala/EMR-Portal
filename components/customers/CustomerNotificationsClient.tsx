'use client'

import { useRouter } from 'next/navigation'
import type { WorkOrder } from '@/lib/types'

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning',
  supervision: 'Supervision',
  overhauling: 'Overhauling',
  complaint: 'Complaint',
  installation: 'Installation',
  testing: 'Testing',
  business_opportunity: 'Business Opportunity',
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
  assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
  completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CustomerNotificationsClient({ notifications }: { notifications: WorkOrder[] }) {
  const router = useRouter()

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Notifications</span>
        <span style={{ fontSize: 11, color: 'var(--txm)' }}>{notifications.length}</span>
      </div>

      {notifications.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <svg width="40" height="40" fill="none" stroke="var(--gm)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 12px' }}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txm)' }}>No notifications yet</div>
          <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 4 }}>Notifications raised for this customer will appear here.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Notification', 'Job type', 'Project', 'Engineer', 'Status', 'Scheduled', ''].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notifications.map(wo => {
                const cfg = STATUS_CFG[wo.status] || STATUS_CFG.unassigned
                return (
                  <tr key={wo.id} style={{ borderBottom: '1px solid var(--gm)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--mp)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                    onClick={() => router.push(`/work-orders/${wo.id}`)}>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--m)', whiteSpace: 'nowrap' }}>{wo.wo_number}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{JOB_LABELS[wo.job_type] || wo.job_type}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{wo.site_name || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: wo.engineer_name ? 'var(--tx)' : 'var(--txm)' }}>{wo.engineer_name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>{formatDate(wo.scheduled_date)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <button onClick={e => { e.stopPropagation(); router.push(`/work-orders/${wo.id}`) }}
                        style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
