'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import type { Form, JobType } from '@/lib/types'

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'amc', label: 'AMC' },
  { value: 'commissioning_activities', label: 'Commissioning Activities' },
  { value: 'supervision', label: 'Supervision' },
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
  const supabase = createClient()

  async function handleSave() {
    setSaving(true)
    await supabase.from('forms').update({ job_type: jobType }).eq('id', form.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  const currentLabel = JOB_TYPES.find(j => j.value === form.job_type)?.label || form.job_type

  return (
    <Modal open={open} onClose={onClose} title="Assign form to job type" size="sm"
      footer={
        <>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: saving ? .7 : 1 }}>
            {saving ? 'Saving…' : 'Save assignment'}
          </button>
        </>
      }
    >
      <div style={{ background: 'var(--mp)', border: '1px solid var(--mb)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--m)' }}>
        When a work order of the selected job type is opened on the mobile app, this form will load automatically for the engineer to fill.
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Currently assigned to</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>{currentLabel}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: form.status === 'active' ? '#D1FAE5' : 'var(--gl)', color: form.status === 'active' ? '#065F46' : 'var(--txm)' }}>{form.status === 'active' ? 'Active' : 'Draft'}</span>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 5, display: 'block' }}>Job type</label>
        <select
          value={jobType} onChange={e => setJobType(e.target.value as JobType)}
          style={{ padding: '9px 12px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}
        >
          {JOB_TYPES.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
        </select>
      </div>
    </Modal>
  )
}
