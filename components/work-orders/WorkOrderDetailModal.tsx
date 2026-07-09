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
      <span style={{ width: 130, fontSize: 11, color: 'var(--txm)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={wo ? `Work Order — ${wo.wo_number}` : 'Work Order Detail'}
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
          {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Work order</div>
              {row('WO Number', wo.wo_number)}
              {row('Job type', JOB_LABELS[wo.job_type] || wo.job_type)}
              {row('Serial No(s)', wo.serial_numbers?.join(', ') || '—')}
              {row('Scheduled', wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
              {row('Engineer', wo.engineer_name || <span style={{ color: 'var(--txm)' }}>Unassigned</span>)}
              {row('Status', statusBadge(wo.status))}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Customer</div>
              {row('Customer', wo.customer_name || '—')}
              {row('Site', wo.site_name || '—')}
              {row('Warranty', wo.has_warranty ? <span style={{ color: '#065F46' }}>Under warranty</span> : <span style={{ color: 'var(--txm)' }}>No</span>)}
              {wo.notes && row('Notes', wo.notes)}
            </div>
          </div>

          {/* Activity timeline */}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>Activity timeline</div>
          <div>
            {activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--m)', marginTop: 3 }} />
                  {i < activity.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--gm)', marginTop: 4 }} />}
                </div>
                <div style={{ paddingBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{a.action}</div>
                  <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {new Date(a.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
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
