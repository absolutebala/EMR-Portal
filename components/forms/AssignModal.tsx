'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { assignForm } from '@/app/actions/assign-form'
import { toggleFormStatus } from '@/app/actions/toggle-form-status'
import type { Form, JobType } from '@/lib/types'

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'amc', label: 'AMC' },
  { value: 'commissioning_activities', label: 'Commissioning' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'overhauling', label: 'Overhauling' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'installation', label: 'Installation' },
  { value: 'testing', label: 'Testing' },
  { value: 'business_opportunity', label: 'Business Opportunity' },
]

interface Props {
  form: Form
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function AssignModal({ form, open, onClose, onSaved }: Props) {
  const [jobType, setJobType] = useState<JobType>(form.job_type)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null)
  const [showPublishPrompt, setShowPublishPrompt] = useState(false)
  const [assignedJobType, setAssignedJobType] = useState<JobType>(form.job_type)

  const currentLabel = JOB_TYPES.find(j => j.value === form.job_type)?.label || form.job_type
  const newLabel = JOB_TYPES.find(j => j.value === jobType)?.label || jobType

  async function handleSave(forceSwap = false) {
    setSaving(true)
    const { error, conflict: c } = await assignForm(form.id, jobType, forceSwap)
    setSaving(false)
    if (c) { setConflict(c); return }
    if (error) { alert(`Assignment failed: ${error}`); return }
    setAssignedJobType(jobType)
    onSaved()
    // If the form is a draft, ask if they want to publish it now
    if (form.status !== 'active') {
      setShowPublishPrompt(true)
    } else {
      onClose()
    }
  }

  async function handlePublish() {
    setPublishing(true)
    const { error } = await toggleFormStatus(form.id, 'draft', assignedJobType, true)
    setPublishing(false)
    if (error) { alert(`Publish failed: ${error}`); }
    onSaved()
    onClose()
  }

  if (!open) return null

  // Step 3: Publish prompt after successful assignment
  if (showPublishPrompt) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg width="20" height="20" fill="none" stroke="#065F46" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Form assigned successfully</div>
          <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 22, lineHeight: 1.7 }}>
            <strong>{form.name}</strong> is assigned to <strong>{JOB_TYPES.find(j => j.value === assignedJobType)?.label}</strong>. This form is currently a draft — would you like to publish it now so engineers can use it?
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Not now</button>
            <button onClick={handlePublish} disabled={publishing} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: publishing ? .7 : 1 }}>
              {publishing ? 'Publishing…' : 'Yes, publish now'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Conflict confirmation
  if (conflict) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>Job type already assigned</div>
          <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 20, lineHeight: 1.7 }}>
            <strong>{conflict.name}</strong> is already published for <strong>{newLabel}</strong>. Assigning this form here will unpublish that one. Continue?
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setConflict(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
            <button onClick={() => { setConflict(null); handleSave(true) }} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Yes, reassign</button>
          </div>
        </div>
      </div>
    )
  }

  // Step 1: Assign form
  return (
    <Modal open={open} onClose={onClose} title="Assign form to job type" size="sm"
      footer={
        <>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button onClick={() => handleSave()} disabled={saving} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
            {saving ? 'Saving…' : 'Save assignment'}
          </button>
        </>
      }
    >
      <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--m)' }}>
        When a notification of the selected job type is opened on the mobile app, this form will load automatically for the engineer to fill.
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Currently assigned to</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{currentLabel}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: form.status === 'active' ? '#D1FAE5' : 'var(--gl)', color: form.status === 'active' ? '#065F46' : 'var(--txm)' }}>
            {form.status === 'active' ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5, display: 'block' }}>Assign to job type</label>
        <select
          value={jobType} onChange={e => setJobType(e.target.value as JobType)}
          style={{ padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}
        >
          {JOB_TYPES.map(j => (
            <option key={j.value} value={j.value}>{j.label}</option>
          ))}
        </select>
        {jobType === form.job_type && (
          <div style={{ fontSize: 11, color: 'var(--txm)', marginTop: 6 }}>This form is already assigned to {currentLabel}.</div>
        )}
      </div>
    </Modal>
  )
}
