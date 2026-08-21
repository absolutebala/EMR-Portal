'use client'

import MobileHeader from '@/components/mobile/MobileHeader'
import { STATUS_CONFIG } from '@/components/mobile/constants'
import type { DepartmentOpenJob } from '@/lib/mobile/core/dashboard'

interface Props {
  department: string
  jobs: DepartmentOpenJob[]
  error: string | null
}

function formatDate(d: string | null): string {
  if (!d) return 'Not scheduled'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Read-only by design — see the plan's safety note: any authenticated engineer can
// already check into/close any work order server-side with no ownership check, so
// this cross-engineer list deliberately doesn't link into the actionable job detail
// screen (/mobile/work-orders/[id]), only shows who's assigned what.
export default function DepartmentJobsClient({ department, jobs, error }: Props) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8F5F6' }}>
      <MobileHeader title={department || 'Department'} backHref="/mobile/dashboard" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!error && (
          <div style={{ fontSize: 11, color: '#7A6870', marginBottom: 12 }}>
            {jobs.length} open notification{jobs.length === 1 ? '' : 's'}
          </div>
        )}
        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!error && jobs.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #E5E0E3' }}>
            <div style={{ fontSize: 12, color: '#7A6870' }}>No open notifications for this department.</div>
          </div>
        )}

        {jobs.map(job => {
          const st = STATUS_CONFIG[job.status] || STATUS_CONFIG.assigned
          return (
            <div key={job.id} style={{ background: '#fff', borderRadius: 12, padding: 13, marginBottom: 9, boxShadow: '0 1px 4px rgba(125,29,63,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1C0D14' }}>{job.woNumber}</span>
                <span style={{ fontSize: 9, fontWeight: 700, background: st.bg, color: st.color, borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>{st.label}</span>
              </div>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 2 }}>{job.customerName}{job.siteName ? ` — ${job.siteName}` : ''}</div>
              {job.serialNumbers.length > 0 && (
                <div style={{ fontSize: 11, color: '#7A6870', marginBottom: 2 }}>Serial: {job.serialNumbers.join(', ')}</div>
              )}
              <div style={{ fontSize: 11, color: '#7A6870', marginBottom: 2 }}>Engineer: {job.engineerName}</div>
              <div style={{ fontSize: 11, color: '#7A6870' }}>Scheduled: {formatDate(job.scheduledDate)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
