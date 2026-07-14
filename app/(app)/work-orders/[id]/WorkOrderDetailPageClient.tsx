'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import {
  getWorkOrderDetail, getTransformersForCustomer, getAssignableEngineers,
  type WorkOrderCheckinInfo, type WorkOrderClosureInfo, type WorkOrderSubmittedForm, type WorkOrderVisit,
} from '@/app/actions/get-work-orders'
import { updateWorkOrderStatus, reassignWorkOrderEngineer, updateWorkOrder } from '@/app/actions/create-work-order'
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
type CustomerTransformer = { id: string; serial_number: string; warranty_status: string; site_name: string | null }

interface EditForm {
  wo_number: string
  job_type: string
  transformer_ids: string[]
  engineer_id: string
  scheduled_date: string
  notes: string
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
  const [checkin, setCheckin] = useState<WorkOrderCheckinInfo | null>(null)
  const [closure, setClosure] = useState<WorkOrderClosureInfo | null>(null)
  const [submittedForm, setSubmittedForm] = useState<WorkOrderSubmittedForm | null>(null)
  const [visits, setVisits] = useState<WorkOrderVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [reassignId, setReassignId] = useState('')
  const [showReassign, setShowReassign] = useState(false)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>({ wo_number: '', job_type: '', transformer_ids: [], engineer_id: '', scheduled_date: '', notes: '' })
  const [customerTransformers, setCustomerTransformers] = useState<CustomerTransformer[]>([])
  const [loadingTransformers, setLoadingTransformers] = useState(false)

  async function refreshDetail() {
    const { workOrder, activity: act, checkin: ci, closure: cl, submittedForm: sf, visits: vs } = await getWorkOrderDetail(workOrderId)
    setWo(workOrder)
    setActivity(act as WorkOrderActivity[])
    setCheckin(ci)
    setClosure(cl)
    setSubmittedForm(sf)
    setVisits(vs)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([refreshDetail(), getAssignableEngineers()]).then(([, { engineers: eng }]) => {
      setEngineers(eng)
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

  async function enterEditMode() {
    if (!wo) return
    setForm({
      wo_number: wo.wo_number,
      job_type: wo.job_type,
      transformer_ids: wo.transformer_ids || [],
      engineer_id: wo.engineer_id || '',
      scheduled_date: wo.scheduled_date || '',
      notes: wo.notes || '',
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
    if (!form.wo_number.trim()) { setError('Work order number is required.'); return }
    if (!form.job_type) { setError('Job type is required.'); return }
    setActing(true); setError('')
    const { error: err } = await updateWorkOrder(wo.id, {
      wo_number: form.wo_number.trim(),
      job_type: form.job_type,
      transformer_ids: form.transformer_ids,
      engineer_id: form.engineer_id || null,
      scheduled_date: form.scheduled_date || null,
      notes: form.notes || null,
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
    setActing(true); setError('')
    const { error: err } = await reassignWorkOrderEngineer(wo.id, reassignId)
    if (err) { setError(err); setActing(false); return }
    await refreshDetail()
    setReassignId(''); setShowReassign(false); setActing(false)
  }

  const nextStatuses = wo ? (STATUS_NEXT[wo.status] || []) : []
  const isComplete = wo?.status === 'completed'

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--gl)' }}>
      <span style={{ width: 130, fontSize: 11, color: 'var(--txm)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  const fieldLabel = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase' as const, letterSpacing: .5, marginBottom: 4, marginTop: 10 }}>{text}</div>
  )

  return (
    <>
      <Topbar title={wo ? `${wo.wo_number} — ${JOB_LABELS[wo.job_type] || wo.job_type}` : 'Work Order Detail'} userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>
        <button
          onClick={() => router.push('/work-orders')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--txm)', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif', padding: 0, marginBottom: 16 }}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Work Orders
        </button>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading…</div>
        ) : !wo ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Work order not found.</div>
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
                      {fieldLabel('Work order number')}
                      <input style={inputStyle} value={form.wo_number} onChange={e => setForm(f => ({ ...f, wo_number: e.target.value }))} placeholder="e.g. WO-2024-001" />

                      {fieldLabel('Job type')}
                      <select style={inputStyle} value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}>
                        <option value="">Select job type…</option>
                        {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>

                      {fieldLabel('Assign engineer')}
                      <select style={inputStyle} value={form.engineer_id} onChange={e => setForm(f => ({ ...f, engineer_id: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                      </select>

                      {fieldLabel('Scheduled date')}
                      <input type="date" style={inputStyle} value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />

                      {fieldLabel('Notes')}
                      <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
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
                                    {t.site_name || 'No site'}
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

                  {checkin && (
                    <div style={{ ...card, display: 'flex', gap: 14 }}>
                      {checkin.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={checkin.photoUrl} alt="Check-in proof" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid var(--gm)' }} />
                      )}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)', marginBottom: 3 }}>Site check-in</div>
                        <div style={{ fontSize: 13, color: 'var(--tx)' }}>{checkin.placeName || 'Location unavailable'}</div>
                        {checkin.latitude != null && checkin.longitude != null && (
                          <div style={{ fontSize: 10, color: 'var(--txm)' }}>{checkin.latitude.toFixed(4)}° N, {checkin.longitude.toFixed(4)}° E</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 2 }}>
                          {new Date(checkin.checkedInAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}
                          {new Date(checkin.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      </div>
                    </div>
                  )}

                  {closure && (
                    <div style={{ ...card, background: closure.outcome === 'completed' ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${closure.outcome === 'completed' ? '#A7F3D0' : '#FCD34D'}` }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: closure.outcome === 'completed' ? '#065F46' : '#92400E', marginBottom: 6 }}>
                        Day closure — {closure.outcome === 'completed' ? 'Marked completed' : 'Marked pending'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--tx)', marginBottom: closure.outcome === 'pending' ? 6 : 0 }}>{closure.summary}</div>
                      {closure.outcome === 'pending' && (
                        <div style={{ fontSize: 11, color: 'var(--tx)' }}>
                          {closure.pendingReason && <div><span style={{ color: 'var(--txm)' }}>Reason: </span>{closure.pendingReason}</div>}
                          {closure.materialsRequired && <div><span style={{ color: 'var(--txm)' }}>Materials needed: </span>{closure.materialsRequired}</div>}
                          {closure.revisitDate && <div><span style={{ color: 'var(--txm)' }}>Expected revisit: </span>{new Date(closure.revisitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--txm)', marginTop: 6 }}>
                        {new Date(closure.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' · '}
                        {new Date(closure.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </div>
                  )}

                  {visits.length > 0 && (
                    <div style={card}>
                      <div style={cardLabel}>Visit history</div>
                      {visits.map((v, i) => (
                        <div key={v.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--gl)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 600,
                              background: v.visitType === 'final' ? '#D1FAE5' : '#FEF3C7',
                              color: v.visitType === 'final' ? '#065F46' : '#92400E',
                            }}>
                              {v.visitType === 'final' ? 'Final visit' : 'Follow-up'}
                            </span>
                            {v.sentToSap && (
                              <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 500, background: '#DBEAFE', color: '#1E40AF' }}>
                                Sent to SAP
                              </span>
                            )}
                            <span style={{ fontSize: 10, color: 'var(--txm)' }}>
                              {new Date(v.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' · '}
                              {new Date(v.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
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
                          {v.pdfUrl && (
                            <a href={v.pdfUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: 'var(--m)', fontWeight: 500 }}>
                              Download visit summary PDF →
                            </a>
                          )}
                        </div>
                      ))}
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
                      <div style={{ border: '1px solid var(--gm)', borderRadius: 10, overflow: 'hidden' }}>
                        {submittedForm.sections.map((sec, si) => {
                          const visibleFields = sec.fields.filter(f => submittedForm.fieldValues[f.id])
                          if (visibleFields.length === 0 && sec.tables.length === 0) return null
                          return (
                            <div key={sec.id} style={{ borderTop: si > 0 ? '1px solid var(--gm)' : 'none' }}>
                              <div style={{ background: 'var(--gl)', padding: '7px 14px', fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{sec.title}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                {visibleFields.map(f => {
                                  const val = submittedForm.fieldValues[f.id]
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
                                    const rv = submittedForm.rowValues[r.id]
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
                      Edit work order
                    </button>
                    {!isComplete && (
                      <button onClick={() => setShowReassign(!showReassign)}
                        style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--amber)', background: '#FEF3C7', color: '#92400E', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
                        {wo.status === 'unassigned' ? 'Assign engineer' : 'Reassign engineer'}
                      </button>
                    )}
                    {showReassign && (
                      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select style={{ padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif' }}
                          value={reassignId} onChange={e => setReassignId(e.target.value)}>
                          <option value="">Select engineer…</option>
                          {engineers.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={handleReassign} disabled={!reassignId || acting}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: !reassignId ? .5 : 1 }}>
                            Assign
                          </button>
                          <button onClick={() => setShowReassign(false)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>✕</button>
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
                <div style={cardLabel}>Work order details</div>
                {row('Work order', <span style={{ color: 'var(--m)' }}>{wo.wo_number}</span>)}
                {row('Serial number(s)', <span style={{ color: 'var(--m)', fontSize: 11 }}>{wo.serial_numbers?.join(', ') || '—'}</span>)}
                {row('Job type', JOB_LABELS[wo.job_type] || wo.job_type)}
                {row('Scheduled', wo.scheduled_date ? new Date(wo.scheduled_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                {row('Assigned engineer', wo.engineer_name || <span style={{ color: 'var(--txm)' }}>Unassigned</span>)}
              </div>

              <div style={card}>
                <div style={cardLabel}>Customer details</div>
                {row('Sold customer', wo.customer_name || '—')}
                {row('Shipped to', wo.site_name || '—')}
                {row('Warranty', wo.has_warranty ? <span style={{ color: '#065F46' }}>Yes</span> : <span style={{ color: 'var(--txm)' }}>No</span>)}
                {row('Status', statusBadge(wo.status))}
                {wo.notes && row('Notes', wo.notes)}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
