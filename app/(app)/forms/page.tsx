'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import FormBuilder from '@/components/forms/FormBuilder'
import AssignModal from '@/components/forms/AssignModal'
import { JobTypeBadge, FormStatusBadge } from '@/components/ui/Badge'
import { duplicateForm } from '@/app/actions/duplicate-form'
import { toggleFormStatus } from '@/app/actions/toggle-form-status'
import { deleteForm } from '@/app/actions/assign-form'
import type { Form } from '@/lib/types'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [currentUser, setCurrentUser] = useState({ name: '', role: '' })
  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [editForm, setEditForm] = useState<Form | null>(null)
  const [assignForm, setAssignForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Form | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [publishConflict, setPublishConflict] = useState<{ form: Form; conflictName: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Form | null>(null)
  const [deleting, setDeleting] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadForms = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('forms').select('*').order('updated_at', { ascending: false })
    setForms(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadForms()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('profiles').select('first_name,last_name,role').eq('id', user.id).single().then(({ data }) => {
        if (data) setCurrentUser({ name: `${data.first_name} ${data.last_name}`, role: data.role })
      })
    })
  }, [loadForms, supabase])

  const filtered = forms.filter(f => {
    const q = search.toLowerCase()
    const matchSearch = !q || f.name.toLowerCase().includes(q)
    const matchJob = !jobFilter || f.job_type === jobFilter
    return matchSearch && matchJob
  })

  async function toggleStatus(form: Form, forceSwap = false) {
    const { error, conflict } = await toggleFormStatus(form.id, form.status, form.job_type, forceSwap)
    if (error) { alert(`Failed to update form status: ${error}`); return }
    if (conflict) { setPublishConflict({ form, conflictName: conflict.name }); return }
    loadForms()
  }

  async function confirmPublishSwap() {
    if (!publishConflict) return
    const { form } = publishConflict
    setPublishConflict(null)
    await toggleStatus(form, true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await deleteForm(deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    if (error) { alert(`Delete failed: ${error}`); return }
    loadForms()
  }

  function openDuplicate(form: Form) {
    setDuplicateTarget(form)
    setDuplicateName(`${form.name} (Copy)`)
  }

  async function confirmDuplicate() {
    if (!duplicateTarget || !duplicateName.trim()) return
    setDuplicating(duplicateTarget.id)
    setDuplicateTarget(null)
    const { error } = await duplicateForm(duplicateTarget.id, duplicateName.trim())
    if (error) alert(`Duplicate failed: ${error}`)
    setDuplicating(null)
    loadForms()
  }

  return (
    <>
      <Topbar title="Forms" userName={currentUser.name} userRole={currentUser.role} />
      <div style={{ flex: 1, padding: '22px 24px' }}>

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gm)', borderRadius: 8, padding: '7px 12px' }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--txm)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search forms..." style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--tx)', background: 'transparent', fontFamily: 'Poppins,sans-serif', width: 180 }}/>
            </div>
            <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} style={{ padding: '7px 12px', border: '1px solid var(--gm)', borderRadius: 8, fontSize: 12, color: 'var(--tx)', background: '#fff', outline: 'none', fontFamily: 'Poppins,sans-serif', cursor: 'pointer' }}>
              <option value="">All job types</option>
              <option value="site_inspection">Site Inspection</option>
              <option value="amc">AMC</option>
              <option value="commissioning_activities">Commissioning Activities</option>
              <option value="supervision">Supervision</option>
            </select>
          </div>
          <button onClick={() => { setEditForm(null); setShowBuilder(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Form
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>Loading forms…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--txm)' }}>
            <svg width="48" height="48" fill="none" stroke="var(--gm)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 12px' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No forms yet</div>
            <div style={{ fontSize: 12 }}>Create your first form to get started</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {filtered.map(f => (
              <div key={f.id} style={{ background: '#fff', border: '1px solid var(--gm)', borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'box-shadow .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(125,29,63,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = ''}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{f.name}</div>
                  <FormStatusBadge status={f.status}/>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <JobTypeBadge type={f.job_type}/>
                  <span style={{ fontSize: 11, color: 'var(--txm)' }}>{f.field_count} fields</span>
                  <span style={{ fontSize: 11, color: 'var(--txm)' }}>Updated {formatDate(f.updated_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => { setAssignForm(f) }} style={{ padding: '5px 10px', fontSize: 11, border: '1px solid var(--mb)', borderRadius: 6, background: 'var(--mp)', color: 'var(--m)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Assign</button>
                  <button onClick={() => { setEditForm(f); setShowBuilder(true) }} style={{ padding: '5px 10px', fontSize: 11, border: '1px solid var(--gm)', borderRadius: 6, background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Edit</button>
                  <button onClick={() => { setEditForm(f); setShowBuilder(true) }} style={{ padding: '5px 10px', fontSize: 11, border: '1px solid var(--gm)', borderRadius: 6, background: '#fff', color: 'var(--tx)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>Preview</button>
                  <button
                    onClick={() => openDuplicate(f)}
                    disabled={duplicating === f.id}
                    style={{ padding: '5px 10px', fontSize: 11, border: '1px solid var(--gm)', borderRadius: 6, background: '#fff', color: 'var(--tx)', cursor: duplicating === f.id ? 'wait' : 'pointer', fontFamily: 'Poppins,sans-serif', opacity: duplicating === f.id ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {duplicating === f.id ? 'Duplicating…' : (
                      <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Duplicate</>
                    )}
                  </button>
                  <button onClick={() => toggleStatus(f)} style={{ padding: '5px 10px', fontSize: 11, border: `1px solid ${f.status === 'active' ? '#FCD34D' : 'var(--gm)'}`, borderRadius: 6, background: f.status === 'active' ? '#FEF3C7' : '#fff', color: f.status === 'active' ? '#92400E' : 'var(--tx)', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>
                    {f.status === 'active' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(f)}
                    title="Delete form"
                    style={{ marginLeft: 'auto', padding: '5px 8px', fontSize: 11, border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontFamily: 'Poppins,sans-serif', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <FormBuilder open={showBuilder} onClose={() => { setShowBuilder(false); setEditForm(null) }} onSaved={loadForms} editForm={editForm}/>
        {assignForm && <AssignModal form={assignForm} open={!!assignForm} onClose={() => setAssignForm(null)} onSaved={loadForms}/>}

        {/* Duplicate name dialog */}
        {duplicateTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>Duplicate form</div>
              <div style={{ fontSize: 11, color: 'var(--txm)', marginBottom: 16 }}>Copying <strong>{duplicateTarget.name}</strong> — enter a name for the new form.</div>
              <input
                autoFocus
                value={duplicateName}
                onChange={e => setDuplicateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmDuplicate(); if (e.key === 'Escape') setDuplicateTarget(null) }}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--m)', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box', marginBottom: 16 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setDuplicateTarget(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
                <button onClick={confirmDuplicate} disabled={!duplicateName.trim()} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: duplicateName.trim() ? 1 : .5 }}>Duplicate</button>
              </div>
            </div>
          </div>
        )}

        {/* Publish conflict confirmation dialog */}
        {publishConflict && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>Cannot assign two forms for one Job Type</div>
              <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 20, lineHeight: 1.6 }}>
                Publishing <strong>{publishConflict.form.name}</strong> will unpublish <strong>{publishConflict.conflictName}</strong>. Continue?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setPublishConflict(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
                <button onClick={confirmPublishSwap} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Yes, publish</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation dialog */}
        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>Delete form</div>
              <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 6, lineHeight: 1.6 }}>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will permanently remove the form and all its sections and fields.
              </div>
              {deleteTarget.status === 'active' && (
                <div style={{ fontSize: 11, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '8px 12px', marginBottom: 4 }}>
                  This form is currently published. Deleting it will remove it from the assigned job type.
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
                <button onClick={confirmDelete} disabled={deleting} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#B91C1C', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: deleting ? .7 : 1 }}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
