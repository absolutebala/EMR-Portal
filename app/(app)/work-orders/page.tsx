'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import NewWorkOrderModal from '@/components/work-orders/NewWorkOrderModal'
import WorkOrderDetailModal from '@/components/work-orders/WorkOrderDetailModal'
import { getWorkOrders } from '@/app/actions/get-work-orders'
import type { WorkOrder } from '@/lib/types'

const JOB_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning Activities',
  supervision: 'Supervision',
}

const JOB_COLORS: Record<string, string> = {
  site_inspection: '#7D1D3F',
  amc: '#0891B2',
  commissioning_activities: '#7C3AED',
  supervision: '#D97706',
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
    assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
    in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
    pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
    completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
  }
  const c = cfg[status] || cfg.unassigned
  return <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
}

function JobBadge({ type }: { type: string }) {
  const color = JOB_COLORS[type] || '#6B7280'
  return <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: color + '18', color, whiteSpace: 'nowrap', border: `1px solid ${color}30` }}>{JOB_LABELS[type] || type}</span>
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [engineers, setEngineers] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [jobFilter, setJobFilter] = useState('')
  const [engFilter, setEngFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadWorkOrders = useCallback(async () => {
    setLoading(true)
    const { workOrders: data } = await getWorkOrders()
    setWorkOrders(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadWorkOrders()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
    // Load service engineers for assignment
    supabase.from('profiles').select('id, first_name, last_name').eq('role', 'Service Engineer').eq('is_active', true).order('first_name').then(({ data }) => {
      if (data) setEngineers(data)
    })
  }, [loadWorkOrders, supabase])

  const filtered = workOrders.filter(wo => {
    const q = search.toLowerCase()
    const matchSearch = !q || wo.wo_number.toLowerCase().includes(q) || (wo.serial_numbers?.join(' ').toLowerCase().includes(q)) || wo.customer_name?.toLowerCase().includes(q) || ''
    const matchStatus = !statusFilter || wo.status === statusFilter
    const matchJob = !jobFilter || wo.job_type === jobFilter
    const matchEng = !engFilter || wo.engineer_id === engFilter
    return matchSearch && matchStatus && matchJob && matchEng
  })

  // Stats
  const stats = {
    open: workOrders.filter(w => w.status !== 'completed').length,
    assigned: workOrders.filter(w => w.status === 'assigned').length,
    unassigned: workOrders.filter(w => w.status === 'unassigned').length,
    pending: workOrders.filter(w => w.status === 'pending').length,
    completed: workOrders.filter(w => w.status === 'completed').length,
  }

  return (
    <>
      <Topbar title="Work Orders" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Open work orders', val: stats.open, sub: 'Total active', color: 'var(--m)' },
            { label: 'Assigned', val: stats.assigned, sub: 'Engineer allocated', color: 'var(--blue)' },
            { label: 'Unassigned', val: stats.unassigned, sub: 'Awaiting assignment', color: 'var(--amber)' },
            { label: 'Pending / Incomplete', val: stats.pending, sub: 'Awaiting revisit', color: 'var(--red)' },
            { label: 'Completed', val: stats.completed, sub: 'All time', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px', flex: 1, minWidth: 220 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO number, serial no, customer…" style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: '100%' }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All statuses</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All job types</option>
            {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={engFilter} onChange={e => setEngFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', background: '#fff', color: 'var(--tx)' }}>
            <option value="">All engineers</option>
            {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
          </select>
          <button onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Work Order
          </button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading work orders…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>
              {workOrders.length === 0 ? 'No work orders yet. Click "New Work Order" to create one.' : 'No work orders match your filters.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr>
                    {['WO Number', 'Serial No(s)', 'Job type', 'Customer', 'Site', 'Engineer', 'Warranty', 'Scheduled', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(wo => (
                    <tr key={wo.id} style={{ borderBottom: '1px solid var(--gm)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--mp)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                      onClick={() => setDetailId(wo.id)}>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--m)', whiteSpace: 'nowrap' }}>{wo.wo_number}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--tx)', maxWidth: 160 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(wo.serial_numbers || []).map(sn => (
                            <span key={sn} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--gl)', border: '1px solid var(--gm)', whiteSpace: 'nowrap' }}>{sn}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}><JobBadge type={wo.job_type} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tx)' }}>{wo.customer_name || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)' }}>{wo.site_name || '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: wo.engineer_name ? 'var(--tx)' : 'var(--txm)' }}>{wo.engineer_name || 'Unassigned'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {wo.has_warranty
                          ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#D1FAE5', color: '#065F46' }}>Yes</span>
                          : <span style={{ fontSize: 11, color: 'var(--txm)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txm)', whiteSpace: 'nowrap' }}>
                        {wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={wo.status} /></td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); setDetailId(wo.id) }}
                          style={{ background: 'var(--gl)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <svg width="12" height="12" fill="none" stroke="var(--txm)" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <NewWorkOrderModal open={showNew} onClose={() => setShowNew(false)} onSaved={loadWorkOrders} engineers={engineers} />
      <WorkOrderDetailModal open={!!detailId} onClose={() => setDetailId(null)} onUpdated={loadWorkOrders} workOrderId={detailId} engineers={engineers} />
    </>
  )
}
