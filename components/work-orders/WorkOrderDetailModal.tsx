'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { getWorkOrderDetail } from '@/app/actions/get-work-orders'
import { updateWorkOrderStatus, reassignWorkOrderEngineer } from '@/app/actions/create-work-order'
import type { WorkOrder, WorkOrderActivity } from '@/lib/types'

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning Activities',
  supervision: 'Supervision',
}

const STATUS_NEXT: Record<string, { label: string; value: string; color: string }[]> = {
  unassigned: [],
  assigned: [{ label: 'Mark In Progress', value: 'in_progress', color: 'var(--amber)' }],
  in_progress: [
    { label: 'Mark Pending', value: 'pending', color: '#EF4444' },
    { label: 'Mark Completed', value: 'completed', color: 'var(--green)' },
  ],
  pending: [{ label: 'Mark In Progress', value: 'in_progress', color: 'var(--amber)' }],
  completed: [],
}

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
    assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
    in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
    pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
    completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  }
  const c = cfg[status] || cfg.unassigned
  return <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color }}>{c.label}</span>
}

function TimelineDot({ action }: { action: string }) {
  const a = action.toLowerCase()
  let bg = 'var(--m)'
  let icon = (
    <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9z"/>
    </svg>
  )
  if (a.includes('assigned') || a.includes('reassigned')) {
    bg = '#1D4ED8'
    icon = (
      <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
      </svg>
    )
  } else if (a.includes('in progress')) {
    bg = '#D97706'
    icon = (
      <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    )
  } else if (a.includes('completed')) {
    bg = '#059669'
    icon = (
      <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    )
  } else if (a.includes('pending')) {
    bg = '#DC2626'
    icon = (
      <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    )
  }
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #fff', boxShadow: '0 0 0 1px ' + bg + '40' }}>
      {icon}
    </div>
  )
}

interface Engineer { id: string; first_name: string; last_name: string }

interface Props {
  open: boolean
  onClose: () => void
  onUpdated: () => void
  workOrderId: string | null
  engineers: Engineer[]
}

export default function WorkOrderDetailModal({ open, onClose, onUpdated, workOrderId, engineers }: Props) {
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [activity, setActivity] = useState<WorkOrderActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [reassignId, setReassignId] = useState('')
  const [showReassign, setShowReassign] = useState(false)

  useEffect(() => {
    if (!open || !workOrderId) { setWo(null); setActivity([]); return }
    setLoading(true)
    getWorkOrderDetail(workOrderId).then(({ workOrder, activity: act }) => {
      setWo(workOrder)
      setActivity(act as WorkOrderActivity[])
      setLoading(false)
    })
  }, [open, workOrderId])

  async function handleStatusUpdate(status: string) {
    if (!wo) return
    setActing(true); setError('')
    const { error: err } = await updateWorkOrderStatus(wo.id, status)
    if (err) { setError(err); setActing(false); return }
    const { workOrder, activity: act } = await getWorkOrderDetail(wo.id)
    setWo(workOrder); setActivity(act as WorkOrderActivity[])
    setActing(false); onUpdated()
  }

  async function handleReassign() {
    if (!wo || !reassignId) return
    setActing(true); setError('')
    const { error: err } = await reassignWorkOrderEngineer(wo.id, reassignId)
    if (err) { setError(err); setActing(false); return }
    const { workOrder, activity: act } = await getWorkOrderDetail(wo.id)
    setWo(workOrder); setActivity(act as WorkOrderActivity[])
    setReassignId(''); setShowReassign(false); setActing(false); onUpdated()
  }

  const nextStatuses = wo ? (STATUS_NEXT[wo.status] || []) : []
  const isComplete = wo?.status === 'completed'

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--gl)' }}>
      <span style={{ width: 140, fontSize: 11, color: 'var(--txm)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={wo ? `${wo.wo_number} — ${JOB_LABELS[wo.job_type] || wo.job_type}` : 'Work Order Detail'}
      footer={
        !isComplete && wo ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>
            <button onClick={() => setShowReassign(!showReassign)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--amber)', background: '#FEF3C7', color: '#92400E', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
              {wo.status === 'unassigned' ? 'Assign engineer' : 'Reassign engineer'}
            </button>
            {nextStatuses.map(s => (
              <button key={s.value} onClick={() => handleStatusUpdate(s.value)} disabled={acting}
                style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: s.color, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: acting ? .7 : 1 }}>
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Close</button>
        )
      }
    >
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading…</div>
      ) : !wo ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Not found</div>
      ) : (
        <div>
          {/* Status/type/warranty tags row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>{JOB_LABELS[wo.job_type] || wo.job_type}</span>
            {statusBadge(wo.status)}
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: wo.has_warranty ? '#D1FAE5' : '#F1F5F9', color: wo.has_warranty ? '#065F46' : '#475569' }}>
              {wo.has_warranty ? 'Under warranty' : 'No warranty'}
            </span>
          </div>

          {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}

          {/* MoM section for completed WOs */}
          {isComplete && (
            <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#065F46', marginBottom: 8 }}>MoM — Minutes of Meeting</div>
              {[
                'MoM generated automatically on job completion',
                `MoM PDF sent to SAP against Serial Number ${wo.serial_numbers?.join(', ') || '—'}`,
                'SAP updated — engineer visits, activities, timestamps, status',
              ].map((text, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11, color: '#065F46' }}>
                  <svg width="16" height="16" fill="none" stroke="#059669" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  {text}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#065F46', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Download MoM PDF</button>
                <button style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>View in SAP</button>
              </div>
            </div>
          )}

          {/* Reassign panel */}
          {showReassign && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ flex: 1, padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }}
                value={reassignId} onChange={e => setReassignId(e.target.value)}>
                <option value="">Select engineer…</option>
                {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              <button onClick={handleReassign} disabled={!reassignId || acting}
                style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: !reassignId ? .5 : 1 }}>
                Assign
              </button>
              <button onClick={() => setShowReassign(false)} style={{ padding: '8px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>✕</button>
            </div>
          )}

          {/* 2-column detail grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Work order details</div>
              {row('Work order', <span style={{ color: 'var(--m)' }}>{wo.wo_number}</span>)}
              {row('Serial number(s)', <span style={{ color: 'var(--m)', fontSize: 11 }}>{wo.serial_numbers?.join(', ') || '—'}</span>)}
              {row('Job type', JOB_LABELS[wo.job_type] || wo.job_type)}
              {row('Scheduled', wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
              {row('Assigned engineer', wo.engineer_name || <span style={{ color: 'var(--txm)' }}>Unassigned</span>)}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Customer details</div>
              {row('Sold customer', wo.customer_name || '—')}
              {row('Shipped to', wo.site_name || '—')}
              {row('Warranty', wo.has_warranty ? <span style={{ color: '#065F46' }}>Yes</span> : <span style={{ color: 'var(--txm)' }}>No</span>)}
              {row('Status', statusBadge(wo.status))}
              {wo.notes && row('Notes', wo.notes)}
            </div>
          </div>

          {/* Activity timeline */}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>Activity timeline</div>
          <div>
            {activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 14, position: 'relative' }}>
                {i < activity.length - 1 && (
                  <div style={{ position: 'absolute', left: 9, top: 22, bottom: 0, width: 1.5, background: 'var(--gm)' }} />
                )}
                <TimelineDot action={a.action} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{a.action}</div>
                  <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {new Date(a.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    {a.actor_name ? ` · ${a.actor_name}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
