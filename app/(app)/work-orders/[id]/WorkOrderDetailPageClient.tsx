'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import Modal from '@/components/ui/Modal'
import {
  getWorkOrderDetail, getTransformersForCustomer, getAssignableEngineers, getEngineerSchedule,
  type WorkOrderSubmittedForm, type WorkOrderVisit, type EngineerScheduleEntry,
} from '@/app/actions/get-work-orders'
import { updateWorkOrderStatus, reassignWorkOrderEngineer, updateWorkOrder } from '@/app/actions/create-work-order'
import { getProductRequestsForWorkOrder, type ProductRequestView } from '@/app/actions/products'
import CustomerCategoryPicker from '@/components/work-orders/CustomerCategoryPicker'
import type { CustomerCategoryType } from '@/app/actions/customer-categories'
import type { WorkOrder, WorkOrderActivity } from '@/lib/types'

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

const REPORTED_THROUGH_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  phone: 'Phone',
  other: 'Other',
}

const SOLUTION_THROUGH_LABELS: Record<string, string> = {
  on_site: 'On-Site',
  virtual: 'Virtual',
}

const STATUS_NEXT: Record<string, { label: string; value: string; color: string }[]> = {
  unassigned: [],
  assigned: [{ label: 'Mark In Progress', value: 'in_progress', color: 'var(--amber)' }],
  // A visit that can't be finished in a day stays In Progress with a follow-up date
  // (set from the mobile closure flow) — there's no manual "Mark Pending" from here
  // anymore, since that flow also requires capturing the follow-up date/reassignment.
  in_progress: [{ label: 'Mark Completed', value: 'completed', color: 'var(--green)' }],
  // Kept only as an escape hatch for any legacy row still sitting in this status.
  pending: [{ label: 'Mark In Progress', value: 'in_progress', color: 'var(--amber)' }],
  // No direct transition button — the exit path is the existing "Reassign engineer"
  // action, which already flips status back to 'assigned' automatically.
  needs_reassignment: [],
  completed: [],
}

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    unassigned: { bg: '#F3F4F6', color: '#6B7280', label: 'Unassigned' },
    assigned: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Assigned' },
    in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
    pending: { bg: '#FEE2E2', color: '#DC2626', label: 'Pending' },
    completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
    needs_reassignment: { bg: '#FED7AA', color: '#9A3412', label: 'Need Reassign' },
  }
  const c = cfg[status] || cfg.unassigned
  return <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: c.bg, color: c.color }}>{c.label}</span>
}

function rowStatusTag(status: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    yes: { bg: '#D1FAE5', color: '#065F46', label: 'Yes' },
    no: { bg: '#FEE2E2', color: '#991B1B', label: 'No' },
    tested: { bg: '#DBEAFE', color: '#1E40AF', label: 'Tested' },
    not_tested: { bg: '#F1F5F9', color: '#475569', label: 'Not tested' },
  }
  const c = cfg[status]
  if (!c) return null
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>{c.label}</span>
}

// Shared between the standalone "Submitted form" card and the per-visit "View form"
// modal — there is only one live form_submissions row per work order (not one per
// visit), so both surfaces render the same current entries.
function renderFormSections(sf: WorkOrderSubmittedForm) {
  return (
    <div style={{ border: '1px solid var(--gm)', borderRadius: 10, overflow: 'hidden' }}>
      {sf.sections.map((sec, si) => {
        const visibleFields = sec.fields.filter(f => sf.fieldValues[f.id])
        if (visibleFields.length === 0 && sec.tables.length === 0) return null
        return (
          <div key={sec.id} style={{ borderTop: si > 0 ? '1px solid var(--gm)' : 'none' }}>
            <div style={{ background: 'var(--gl)', padding: '7px 14px', fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{sec.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {visibleFields.map(f => {
                const val = sf.fieldValues[f.id]
                return (
                  <div key={f.id} style={{ padding: '8px 14px', borderTop: '1px solid var(--gl)' }}>
                    <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 4 }}>{f.label}</div>
                    {f.field_type === 'signature' || f.field_type === 'photo' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={val} alt={f.label} style={{ maxWidth: f.field_type === 'signature' ? 200 : 120, maxHeight: 120, borderRadius: 6, border: '1px solid var(--gm)' }} />
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--tx)' }}>{val}</div>
                    )}
                  </div>
                )
              })}
            </div>
            {sec.tables.map(t => (
              <div key={t.id} style={{ borderTop: '1px solid var(--gl)' }}>
                {t.rows.map(r => {
                  const rv = sf.rowValues[r.id]
                  if (!rv?.status) return null
                  return (
                    <div key={r.id} style={{ padding: '7px 14px', paddingLeft: r.parent_row_id ? 28 : 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--gl)' }}>
                      <div style={{ fontSize: 11, color: 'var(--tx)' }}>
                        {r.sno_label && <span style={{ color: 'var(--txm)', marginRight: 4 }}>{r.sno_label}.</span>}
                        {r.row_label}
                        {rv.remarks && <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>{rv.remarks}</div>}
                      </div>
                      {rowStatusTag(rv.status)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
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

interface Engineer {
  id: string; first_name: string; last_name: string
  distanceKm?: number | null
  lastCheckinPlace?: string | null
  lastCheckinAt?: string | null
}

function engineerOptionLabel(e: Engineer, nearestId: string | null): string {
  const name = `${e.first_name} ${e.last_name}`
  if (e.distanceKm == null) return name
  const suffix = e.id === nearestId ? ' — Nearest' : ''
  return `${name} (~${e.distanceKm < 1 ? '<1' : Math.round(e.distanceKm)} km away)${suffix}`
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}
type CustomerTransformer = { id: string; serial_number: string; warranty_status: string; site_name: string | null }

interface EditForm {
  wo_number: string
  job_type: string
  transformer_ids: string[]
  engineer_id: string
  scheduled_date: string
  notes: string
  reported_date: string
  reported_through: string
  customer_message: string
  solution_through: string
  additional_engineer_ids: string[]
  customer_type: string
  customer_category_id: string
  customer_category_name: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7,
  fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', color: 'var(--tx)',
  background: '#fff', boxSizing: 'border-box',
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', padding: 16, marginBottom: 14,
}

const cardLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10,
}

export default function WorkOrderDetailPageClient({ workOrderId }: { workOrderId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [engineers, setEngineers] = useState<Engineer[]>([])

  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [activity, setActivity] = useState<WorkOrderActivity[]>([])
  const [submittedForm, setSubmittedForm] = useState<WorkOrderSubmittedForm | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null)
  const [visits, setVisits] = useState<WorkOrderVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [reassignId, setReassignId] = useState('')
  const [showReassign, setShowReassign] = useState(false)
  const [reassignDate, setReassignDate] = useState('')
  const [engineerSchedule, setEngineerSchedule] = useState<EngineerScheduleEntry[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>({
    wo_number: '', job_type: '', transformer_ids: [], engineer_id: '', scheduled_date: '', notes: '',
    reported_date: '', reported_through: '', customer_message: '', solution_through: '', additional_engineer_ids: [],
    customer_type: '', customer_category_id: '', customer_category_name: '',
  })
  const [customerTransformers, setCustomerTransformers] = useState<CustomerTransformer[]>([])
  const [loadingTransformers, setLoadingTransformers] = useState(false)
  const [productRequests, setProductRequests] = useState<ProductRequestView[]>([])

  async function refreshDetail() {
    const { workOrder, activity: act, submittedForm: sf, visits: vs } = await getWorkOrderDetail(workOrderId)
    setWo(workOrder)
    setActivity(act as WorkOrderActivity[])
    setSubmittedForm(sf)
    setVisits(vs)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([refreshDetail(), getAssignableEngineers(workOrderId), getProductRequestsForWorkOrder(workOrderId)]).then(([, { engineers: eng }, { requests }]) => {
      setEngineers(eng)
      setProductRequests(requests)
      setLoading(false)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id
      if (userId) supabase.from('profiles').select('first_name,last_name,role').eq('id', userId).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId])

  useEffect(() => {
    // engineerSchedule is only ever rendered while reassignId is set (see the
    // {reassignId && (...)} block below), so there's nothing to clear here when
    // it's blank — the next selection just overwrites it once fetched.
    if (!reassignId) return
    let cancelled = false
    setLoadingSchedule(true)
    getEngineerSchedule(reassignId, workOrderId).then(({ entries }) => {
      if (!cancelled) { setEngineerSchedule(entries); setLoadingSchedule(false) }
    })
    return () => { cancelled = true }
  }, [reassignId, workOrderId])

  async function enterEditMode() {
    if (!wo) return
    setForm({
      wo_number: wo.wo_number,
      job_type: wo.job_type,
      transformer_ids: wo.transformer_ids || [],
      engineer_id: wo.engineer_id || '',
      scheduled_date: wo.scheduled_date || '',
      notes: wo.notes || '',
      reported_date: wo.reported_date || '',
      reported_through: wo.reported_through || '',
      customer_message: wo.customer_message || '',
      solution_through: wo.solution_through || '',
      additional_engineer_ids: (wo.additional_engineers || []).map(e => e.id),
      customer_type: wo.customer_type || '',
      customer_category_id: wo.customer_category_id || '',
      customer_category_name: wo.customer_category_name || '',
    })
    setEditing(true)
    setShowReassign(false)
    setError('')
    setLoadingTransformers(true)
    const { transformers } = await getTransformersForCustomer(wo.customer_id)
    setCustomerTransformers(transformers)
    setLoadingTransformers(false)
  }

  function cancelEdit() {
    setEditing(false)
    setError('')
  }

  function toggleTransformer(id: string) {
    setForm(f => ({
      ...f,
      transformer_ids: f.transformer_ids.includes(id) ? f.transformer_ids.filter(t => t !== id) : [...f.transformer_ids, id],
    }))
  }

  async function handleSaveEdit() {
    if (!wo) return
    if (!form.wo_number.trim()) { setError('Notification number is required.'); return }
    if (!form.job_type) { setError('Job type is required.'); return }
    setActing(true); setError('')
    const { error: err } = await updateWorkOrder(wo.id, {
      wo_number: form.wo_number.trim(),
      job_type: form.job_type,
      transformer_ids: form.transformer_ids,
      engineer_id: form.engineer_id || null,
      scheduled_date: form.scheduled_date || null,
      notes: form.notes || null,
      reported_date: form.reported_date || null,
      reported_through: form.reported_through || null,
      customer_message: form.customer_message || null,
      solution_through: form.solution_through || null,
      additional_engineer_ids: form.solution_through === 'virtual' ? form.additional_engineer_ids : [],
      customer_type: form.customer_type || null,
      customer_category_id: form.customer_category_id || null,
    })
    if (err) { setError(err); setActing(false); return }
    await refreshDetail()
    setEditing(false); setActing(false)
  }

  async function handleStatusUpdate(status: string) {
    if (!wo) return
    setActing(true); setError('')
    const { error: err } = await updateWorkOrderStatus(wo.id, status)
    if (err) { setError(err); setActing(false); return }
    await refreshDetail()
    setActing(false)
  }

  async function handleReassign() {
    if (!wo || !reassignId) return
    if (!reassignDate) { setError('Please select a scheduled date.'); return }
    setActing(true); setError('')
    const { error: err } = await reassignWorkOrderEngineer(wo.id, reassignId, reassignDate || null)
    if (err) { setError(err); setActing(false); return }
    await refreshDetail()
    setReassignId(''); setReassignDate(''); setEngineerSchedule([]); setShowReassign(false); setActing(false)
  }

  const nextStatuses = wo ? (STATUS_NEXT[wo.status] || []) : []
  const isComplete = wo?.status === 'completed'
  // Most recent "completed" closure — visits is already sorted newest-first,
  // so the first match is the actual completion date (work_orders has no
  // dedicated completed_at column).
  const completedAt = visits.find(v => v.outcome === 'completed')?.createdAt ?? null

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--gl)' }}>
      <span style={{ width: 130, fontSize: 11, color: 'var(--txm)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  const fieldLabel = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 4, marginTop: 10 }}>{text}</div>
  )

  const nearestEngineerId = engineers.find(e => e.distanceKm != null)?.id ?? null

  return (
    <>
      <Topbar title={wo ? `${wo.wo_number} — ${JOB_LABELS[wo.job_type] || wo.job_type}` : 'Notification Detail'} userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <button
          onClick={() => router.push('/work-orders')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--txm)', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif', padding: 0, marginBottom: 16 }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Notifications
        </button>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading…</div>
        ) : !wo ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Notification not found.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'flex-start' }}>

            {/* ── Main column ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#F1F5F9', color: '#475569', fontWeight: 500 }}>{JOB_LABELS[wo.job_type] || wo.job_type}</span>
                {statusBadge(wo.status)}
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: wo.has_warranty ? '#D1FAE5' : '#F1F5F9', color: wo.has_warranty ? '#065F46' : '#475569' }}>
                  {wo.has_warranty ? 'Under warranty' : 'No warranty'}
                </span>
              </div>

              {error && <div style={{ background: '#FEE2E2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 14 }}>{error}</div>}

              {editing ? (
                <div style={card}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      {fieldLabel('Notification number')}
                      <input style={inputStyle} value={form.wo_number} onChange={e => setForm(f => ({ ...f, wo_number: e.target.value }))} placeholder="e.g. WO-2024-001" />

                      {fieldLabel('Job type')}
                      <select style={inputStyle} value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}>
                        <option value="">Select job type…</option>
                        {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>

                      {fieldLabel('Assign engineer')}
                      <select style={inputStyle} value={form.engineer_id} onChange={e => setForm(f => ({ ...f, engineer_id: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {engineers.map(e => <option key={e.id} value={e.id}>{engineerOptionLabel(e, nearestEngineerId)}</option>)}
                      </select>

                      {fieldLabel('Scheduled date')}
                      <input type="date" style={inputStyle} value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />

                      {fieldLabel('Notes')}
                      <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />

                      {fieldLabel('Reported date')}
                      <input type="date" style={inputStyle} value={form.reported_date} onChange={e => setForm(f => ({ ...f, reported_date: e.target.value }))} max={new Date().toLocaleDateString('en-CA')} />

                      {fieldLabel('Reported through')}
                      <select style={inputStyle} value={form.reported_through} onChange={e => setForm(f => ({ ...f, reported_through: e.target.value }))}>
                        <option value="">Select…</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="other">Other</option>
                      </select>

                      {fieldLabel('Customer message')}
                      <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }} value={form.customer_message} onChange={e => setForm(f => ({ ...f, customer_message: e.target.value }))} placeholder="What the customer reported…" />

                      {fieldLabel('Solution through')}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {[{ value: 'on_site', label: 'On-Site' }, { value: 'virtual', label: 'Virtual' }].map(o => (
                          <button key={o.value} type="button" onClick={() => setForm(f => ({ ...f, solution_through: o.value }))}
                            style={{
                              flex: 1, padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif',
                              border: `1.5px solid ${form.solution_through === o.value ? 'var(--m)' : 'var(--gm)'}`,
                              background: form.solution_through === o.value ? 'var(--mp)' : '#fff',
                              color: form.solution_through === o.value ? 'var(--m)' : 'var(--tx)',
                            }}>
                            {o.label}
                          </button>
                        ))}
                      </div>

                      {form.solution_through === 'virtual' && (
                        <>
                          {fieldLabel('Additional engineers (virtual participants)')}
                          <div style={{ border: '1.5px solid var(--gm)', borderRadius: 7, maxHeight: 150, overflowY: 'auto' }}>
                            {engineers.length === 0 ? (
                              <div style={{ padding: 10, fontSize: 12, color: 'var(--txm)' }}>No field engineers found.</div>
                            ) : engineers.map((e, i) => (
                              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderTop: i > 0 ? '1px solid var(--gl)' : 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={form.additional_engineer_ids.includes(e.id)}
                                  onChange={() => setForm(f => ({
                                    ...f,
                                    additional_engineer_ids: f.additional_engineer_ids.includes(e.id)
                                      ? f.additional_engineer_ids.filter(id => id !== e.id)
                                      : [...f.additional_engineer_ids, e.id],
                                  }))}
                                  style={{ accentColor: 'var(--m)', width: 14, height: 14 }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--tx)' }}>{e.first_name} {e.last_name}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}

                      {fieldLabel('End user type')}
                      <div style={{ display: 'flex', gap: 8, marginBottom: form.customer_type ? 10 : 0 }}>
                        {[{ value: 'utility', label: 'Utility' }, { value: 'industry', label: 'Industry' }].map(o => (
                          <button key={o.value} type="button"
                            onClick={() => setForm(f => ({ ...f, customer_type: o.value, customer_category_id: '', customer_category_name: '' }))}
                            style={{
                              flex: 1, padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif',
                              border: `1.5px solid ${form.customer_type === o.value ? 'var(--m)' : 'var(--gm)'}`,
                              background: form.customer_type === o.value ? 'var(--mp)' : '#fff',
                              color: form.customer_type === o.value ? 'var(--m)' : 'var(--tx)',
                            }}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                      {form.customer_type && (
                        <CustomerCategoryPicker
                          customerType={form.customer_type as CustomerCategoryType}
                          valueId={form.customer_category_id}
                          valueName={form.customer_category_name}
                          onChange={(id, name) => setForm(f => ({ ...f, customer_category_id: id, customer_category_name: name }))}
                        />
                      )}
                    </div>

                    <div>
                      {fieldLabel('Serial numbers (transformers)')}
                      {loadingTransformers ? (
                        <div style={{ fontSize: 12, color: 'var(--txm)', padding: '8px 0' }}>Loading transformers…</div>
                      ) : customerTransformers.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--txm)', padding: '8px 0' }}>No transformers registered for this customer.</div>
                      ) : (
                        <div style={{ border: '1.5px solid var(--gm)', borderRadius: 7, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                          {customerTransformers.map((t, i) => {
                            const checked = form.transformer_ids.includes(t.id)
                            return (
                              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: i < customerTransformers.length - 1 ? '1px solid var(--gl)' : 'none', background: checked ? 'var(--mp)' : '#fff' }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleTransformer(t.id)} style={{ accentColor: 'var(--m)', width: 14, height: 14, flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: checked ? 600 : 400, color: checked ? 'var(--m)' : 'var(--tx)' }}>{t.serial_number}</div>
                                  <div style={{ fontSize: 10, color: 'var(--txm)' }}>
                                    {t.site_name || 'No project'}
                                    {' · '}
                                    <span style={{ color: t.warranty_status === 'under_warranty' ? '#059669' : '#6B7280' }}>
                                      {t.warranty_status === 'under_warranty' ? 'Under warranty' : 'No warranty'}
                                    </span>
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                      {form.transformer_ids.length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 5 }}>{form.transformer_ids.length} transformer(s) selected</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                    <button onClick={handleSaveEdit} disabled={acting}
                      style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: acting ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins,sans-serif', opacity: acting ? .7 : 1 }}>
                      {acting ? 'Saving…' : 'Save changes'}
                    </button>
                    <button onClick={cancelEdit} disabled={acting}
                      style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {isComplete && (
                    <div style={{ ...card, background: '#F0FDF4', border: '1px solid #A7F3D0' }}>
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


                  {visits.length > 0 && (
                    <div style={card}>
                      <div style={cardLabel}>Visit history</div>
                      {visits.map((v, i) => {
                        const outcomeCfg = {
                          completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
                          pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
                          in_progress: { bg: '#DBEAFE', color: '#1E40AF', label: 'In progress' },
                        }[v.outcome]
                        const dateLabel = new Date(v.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        return (
                          <div key={v.id} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--gl)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{dateLabel}</span>
                              <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 600, background: outcomeCfg.bg, color: outcomeCfg.color }}>
                                {outcomeCfg.label}
                              </span>
                              {v.needsReassignment && (
                                <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 600, background: '#FED7AA', color: '#9A3412' }}>
                                  Needs reassignment
                                </span>
                              )}
                              {v.sentToSap && (
                                <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 500, background: '#DBEAFE', color: '#1E40AF' }}>
                                  Sent to SAP
                                </span>
                              )}
                            </div>

                            {v.checkin && (
                              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                {v.checkin.photoUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={v.checkin.photoUrl}
                                    alt="Check-in proof"
                                    onClick={() => setEnlargedPhoto(v.checkin!.photoUrl)}
                                    style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, flexShrink: 0, border: '1px solid var(--gm)', cursor: 'pointer' }}
                                  />
                                )}
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 2 }}>Checked in</div>
                                  <div style={{ fontSize: 12, color: 'var(--tx)' }}>{v.checkin.placeName || 'Location unavailable'}</div>
                                  <div style={{ fontSize: 10, color: 'var(--txm)' }}>
                                    {new Date(v.checkin.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    {v.checkin.latitude != null && v.checkin.longitude != null && ` · ${v.checkin.latitude.toFixed(4)}° N, ${v.checkin.longitude.toFixed(4)}° E`}
                                  </div>
                                  {v.outcome !== 'in_progress' && (
                                    <>
                                      <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 6, marginBottom: 2 }}>Checked out</div>
                                      <div style={{ fontSize: 10, color: 'var(--txm)' }}>
                                        {new Date(v.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {v.summary && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 2 }}>{v.outcome === 'completed' ? 'Work summary' : 'Remarks'}</div>
                                <div style={{ fontSize: 12, color: 'var(--tx)' }}>{v.summary}</div>
                              </div>
                            )}

                            {v.outcome === 'pending' && (v.pendingReason || v.materialsRequired || v.revisitDate) && (
                              <div style={{ fontSize: 11, color: 'var(--tx)', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {v.pendingReason && <div><span style={{ color: 'var(--txm)' }}>Reason: </span>{v.pendingReason}</div>}
                                {v.materialsRequired && <div><span style={{ color: 'var(--txm)' }}>Product/parts requested: </span>{v.materialsRequired}</div>}
                                {v.revisitDate && <div><span style={{ color: 'var(--txm)' }}>Follow-up date: </span>{new Date(v.revisitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                              </div>
                            )}

                            {(v.engineerSignature || v.clientSignature) && (
                              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 4 }}>Engineer — {v.engineerName}</div>
                                  {v.engineerSignature && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.engineerSignature} alt="Engineer signature" style={{ width: 120, height: 50, objectFit: 'contain', background: '#fff', border: '1px solid var(--gm)', borderRadius: 6 }} />
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 4 }}>Client — {v.clientName || '—'}</div>
                                  {v.clientSignature && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.clientSignature} alt="Client signature" style={{ width: 120, height: 50, objectFit: 'contain', background: '#fff', border: '1px solid var(--gm)', borderRadius: 6 }} />
                                  )}
                                </div>
                              </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                              {submittedForm && (
                                <button
                                  onClick={() => setFormModalOpen(true)}
                                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--m)', background: 'var(--mp)', color: 'var(--m)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}
                                >
                                  View form
                                </button>
                              )}
                              {v.pdfUrl && (
                                <a href={v.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500 }}>
                                  Download visit PDF →
                                </a>
                              )}
                              {v.wordUrl && (
                                <a href={v.wordUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--m)', fontWeight: 500 }}>
                                  Download visit Word doc →
                                </a>
                              )}
                              {!submittedForm && !v.pdfUrl && !v.wordUrl && (
                                <span style={{ fontSize: 11, color: 'var(--txm)' }}>No form data available</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {submittedForm && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={cardLabel}>
                        Submitted form — {submittedForm.formName}
                        {submittedForm.submittedAt && (
                          <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--txm)' }}>
                            {' · '}{new Date(submittedForm.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {renderFormSections(submittedForm)}
                    </div>
                  )}

                  {productRequests.length > 0 && (
                    <div style={card}>
                      <div style={cardLabel}>Product requests</div>
                      {productRequests.map((req, ri) => (
                        <div key={req.id} style={{ padding: '10px 0', borderTop: ri > 0 ? '1px solid var(--gl)' : 'none' }}>
                          <div style={{ fontSize: 10, color: 'var(--txm)', marginBottom: 6 }}>
                            {req.engineerName || 'Engineer'} · {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          {req.items.map(item => {
                            const cfg = {
                              pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending approval' },
                              approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
                              rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
                              dispatched: { bg: '#D1FAE5', color: '#065F46', label: 'Dispatched' },
                            }[item.status]
                            return (
                              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 12 }}>
                                <span style={{ color: 'var(--tx)' }}>{item.productName} × {item.quantity}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={card}>
                    <div style={cardLabel}>Activity timeline</div>
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
                </>
              )}
            </div>

            {/* ── Right sidebar ── */}
            <div style={{ position: 'sticky', top: 22 }}>
              {!editing && (
                <div style={card}>
                  <div style={cardLabel}>Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={enterEditMode}
                      style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--m)', background: 'var(--mp)', color: 'var(--m)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                      Edit notification
                    </button>
                    {!isComplete && (
                      <button onClick={() => setShowReassign(!showReassign)}
                        style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--amber)', background: '#FEF3C7', color: '#92400E', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                        {wo.status === 'unassigned' ? 'Assign engineer' : 'Reassign engineer'}
                      </button>
                    )}
                    {showReassign && (
                      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#9A3412', textTransform: 'uppercase', letterSpacing: .4 }}>
                          Suggested engineers — nearest to project first
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {engineers.map(e => {
                            const selected = e.id === reassignId
                            return (
                              <div key={e.id} onClick={() => { setReassignId(e.id); setReassignDate(prev => prev || new Date().toLocaleDateString('en-CA')) }}
                                style={{
                                  padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                                  border: `1.5px solid ${selected ? 'var(--m)' : 'var(--gm)'}`,
                                  background: selected ? 'var(--mp)' : '#fff',
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: selected ? 'var(--m)' : 'var(--tx)' }}>{e.first_name} {e.last_name}</span>
                                  {e.distanceKm != null && (
                                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: e.id === nearestEngineerId ? '#D1FAE5' : 'var(--gl)', color: e.id === nearestEngineerId ? '#065F46' : 'var(--txm)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                      {e.id === nearestEngineerId ? 'Nearest · ' : ''}~{e.distanceKm < 1 ? '<1' : Math.round(e.distanceKm)} km
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
                                  {e.lastCheckinPlace ? `Last seen: ${e.lastCheckinPlace} · ${relativeTime(e.lastCheckinAt)}` : 'No check-in history yet'}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {reassignId && (
                          <>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: '#9A3412', textTransform: 'uppercase', letterSpacing: .4, display: 'block', marginBottom: 4 }}>
                                Scheduled date <span style={{ color: 'var(--m)' }}>*</span>
                              </label>
                              <input type="date" required value={reassignDate} min={new Date().toLocaleDateString('en-CA')} onChange={e => setReassignDate(e.target.value)}
                                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9A3412', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>
                                {engineers.find(e => e.id === reassignId)?.first_name}&apos;s upcoming schedule
                              </div>
                              {loadingSchedule ? (
                                <div style={{ fontSize: 11, color: 'var(--txm)' }}>Loading…</div>
                              ) : engineerSchedule.length === 0 ? (
                                <div style={{ fontSize: 11, color: 'var(--txm)' }}>No other upcoming jobs scheduled.</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {engineerSchedule.map(s => {
                                    const conflict = !!reassignDate && s.scheduledDate === reassignDate
                                    return (
                                      <div key={s.workOrderId} style={{ fontSize: 11, padding: '6px 8px', borderRadius: 6, background: conflict ? '#FEE2E2' : '#fff', border: `1px solid ${conflict ? '#FECACA' : 'var(--gl)'}` }}>
                                        <div style={{ fontWeight: 500, color: conflict ? '#991B1B' : 'var(--tx)' }}>
                                          {new Date(s.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                          {conflict ? ' — clashes with picked date' : ''}
                                        </div>
                                        <div style={{ color: 'var(--txm)' }}>{s.customerName}{s.siteName ? ` · ${s.siteName}` : ''}{s.placeLabel ? ` · ${s.placeLabel}` : ''} ({s.woNumber})</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={handleReassign} disabled={!reassignId || !reassignDate || acting}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', background: acting ? '#C4B5A0' : 'var(--m)', color: '#fff', cursor: (!reassignId || !reassignDate || acting) ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (!reassignId || !reassignDate) ? .5 : 1 }}>
                            {acting ? 'Assigning…' : 'Assign'}
                          </button>
                          <button onClick={() => { setShowReassign(false); setReassignId(''); setReassignDate(''); setEngineerSchedule([]) }} disabled={acting}
                            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: acting ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif', opacity: acting ? .5 : 1 }}>✕</button>
                        </div>
                      </div>
                    )}
                    {nextStatuses.map(s => (
                      <button key={s.value} onClick={() => handleStatusUpdate(s.value)} disabled={acting}
                        style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: s.color, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: acting ? .7 : 1 }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={card}>
                <div style={cardLabel}>Notification details</div>
                {row('Ticket number', <span style={{ color: 'var(--m)' }}>{wo.ticket_number}</span>)}
                {row('Notification', <span style={{ color: 'var(--m)' }}>{wo.wo_number}</span>)}
                {row('Serial number(s)', <span style={{ color: 'var(--m)', fontSize: 11 }}>{wo.serial_numbers?.join(', ') || '—'}</span>)}
                {row('Job type', JOB_LABELS[wo.job_type] || wo.job_type)}
                {row('Created', new Date(wo.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}
                {row('Scheduled', wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                {row('Completed', completedAt ? new Date(completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                {row('Assigned engineer', wo.engineer_name || <span style={{ color: 'var(--txm)' }}>Unassigned</span>)}
                {row('Status', statusBadge(wo.status))}
                {wo.reported_date && row('Reported date', new Date(wo.reported_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}
                {wo.reported_through && row('Reported through', REPORTED_THROUGH_LABELS[wo.reported_through] || wo.reported_through)}
                {wo.solution_through && row('Solution through', SOLUTION_THROUGH_LABELS[wo.solution_through] || wo.solution_through)}
                {wo.additional_engineers && wo.additional_engineers.length > 0 && row('Additional engineers', wo.additional_engineers.map(e => e.name).join(', '))}
              </div>

              <div style={card}>
                <div style={cardLabel}>Customer details</div>
                {row('Sold customer', wo.customer_name || '—')}
                {row('Shipped to', wo.site_name || '—')}
                {row('Project', wo.site_name || '—')}
                {row('End user type', wo.customer_type === 'utility' ? 'Utility' : wo.customer_type === 'industry' ? 'Industry' : '—')}
                {row('Category', wo.customer_category_name || '—')}
                {row('Warranty', wo.has_warranty ? <span style={{ color: '#065F46' }}>Yes</span> : <span style={{ color: 'var(--txm)' }}>No</span>)}
                {wo.notes && row('Notes', wo.notes)}
                {wo.customer_message && row('Customer message', wo.customer_message)}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={formModalOpen && !!submittedForm}
        onClose={() => setFormModalOpen(false)}
        title={submittedForm ? `Submitted form — ${submittedForm.formName}` : 'Submitted form'}
        size="lg"
      >
        {submittedForm && renderFormSections(submittedForm)}
      </Modal>

      <Modal open={!!enlargedPhoto} onClose={() => setEnlargedPhoto(null)} title="Check-in photo" size="lg">
        {enlargedPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enlargedPhoto} alt="Check-in proof" style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '75vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 8 }} />
        )}
      </Modal>
    </>
  )
}
