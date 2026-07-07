'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveForm } from '@/app/actions/save-form'
import {
  createFormWithDefaults,
  getFormData,
  addFormSection,
  updateFormSectionTitle,
  deleteFormSection,
  addFormField,
  updateFormField,
  deleteFormField,
  addFormTable,
  addFormTableRow,
  reorderFormSections,
} from '@/app/actions/form-builder-actions'
import { deleteForm } from '@/app/actions/assign-form'
import type { Form, FormSection, FormField, FormTable, FormTableRow, FieldType, JobType } from '@/lib/types'

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'amc', label: 'AMC' },
  { value: 'commissioning_activities', label: 'Commissioning Activities' },
  { value: 'supervision', label: 'Supervision' },
]

const FIELD_TYPES: { type: FieldType; label: string; icon: React.ReactNode }[] = [
  { type: 'text', label: 'Text', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg> },
  { type: 'number', label: 'Number', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> },
  { type: 'long_text', label: 'Long text', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
  { type: 'dropdown', label: 'Dropdown', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg> },
  { type: 'date', label: 'Date', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { type: 'photo', label: 'Photo', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg> },
  { type: 'signature', label: 'Signature', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg> },
  { type: 'checkbox', label: 'Checkbox', icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
]

interface FullSection extends FormSection {
  fields: FormField[]
  tables: (FormTable & { rows: FormTableRow[] })[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editForm?: Form | null
}

interface Selected {
  type: 'field' | 'table'
  id: string
  sectionId: string
}

export default function FormBuilder({ open, onClose, onSaved, editForm }: Props) {
  const [formName, setFormName] = useState('')
  const [jobType, setJobType] = useState<JobType>('site_inspection')
  const [tab, setTab] = useState<'build' | 'preview'>('build')
  const [sections, setSections] = useState<FullSection[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  const [propLabel, setPropLabel] = useState('')
  const [propType, setPropType] = useState<FieldType>('text')
  const [propRequired, setPropRequired] = useState(false)
  const [propPrefill, setPropPrefill] = useState(false)
  const [propReadOnly, setPropReadOnly] = useState(false)
  const [propPlaceholder, setPropPlaceholder] = useState('')
  const [propHelp, setPropHelp] = useState('')
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [formId, setFormId] = useState<string | null>(null)
  const [isNewForm, setIsNewForm] = useState(false)
  const [publishConflict, setPublishConflict] = useState<{ conflictName: string } | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadForm = useCallback(async (id: string) => {
    setSections([])
    const { data, error } = await getFormData(id)
    if (error) { alert(`Failed to load form: ${error}`); return }
    setSections((data as FullSection[]) || [])
  }, [])

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setTab('build')
    setDragIdx(null)
    setDragOverIdx(null)

    if (editForm) {
      setFormName(editForm.name)
      setJobType(editForm.job_type)
      setFormId(editForm.id)
      setIsNewForm(false)
      loadForm(editForm.id)
    } else {
      setFormName('Untitled')
      setJobType('site_inspection')
      setFormId(null)
      setSections([])
      setIsNewForm(true)
      setInitializing(true)
      createFormWithDefaults({ name: 'Untitled', job_type: 'site_inspection' }).then(({ id, error }) => {
        setInitializing(false)
        if (error || !id) { alert('Failed to initialise form'); return }
        setFormId(id)
        loadForm(id)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editForm?.id])

  // If user cancels a new form without saving, delete the auto-created draft
  async function handleClose() {
    if (isNewForm && formId) {
      await deleteForm(formId)
    }
    onClose()
  }

  async function addSection() {
    if (!formId) return
    const { section, error } = await addFormSection(formId, 'New section', sections.length + 1)
    if (error || !section) { alert(`Could not add section: ${error}`); return }
    setSections(s => [...s, { ...section, fields: [], tables: [] }])
  }

  async function updateSectionTitle(secId: string, title: string) {
    setSections(ss => ss.map(s => s.id === secId ? { ...s, title } : s))
    await updateFormSectionTitle(secId, title)
  }

  async function deleteSection(secId: string) {
    const { error } = await deleteFormSection(secId)
    if (error) { alert(`Could not delete section: ${error}`); return }
    setSections(ss => ss.filter(s => s.id !== secId))
    if (selected?.sectionId === secId) setSelected(null)
  }

  async function addField(secId: string, type: FieldType = 'text') {
    if (!formId) return
    const sec = sections.find(s => s.id === secId)
    const order = (sec?.fields.length || 0) + 1
    const { field, error } = await addFormField(secId, type, order)
    if (error || !field) { alert(`Could not add field: ${error}`); return }
    const f = field as unknown as FormField
    setSections(ss => ss.map(s => s.id === secId ? { ...s, fields: [...s.fields, f] } : s))
    selectField(f.id, secId, f)
  }

  async function addTableBlock(secId: string) {
    if (!formId) return
    const sec = sections.find(s => s.id === secId)
    const order = (sec?.tables.length || 0) + 1
    const { table, error } = await addFormTable(secId, order)
    if (error || !table) { alert(`Could not add table: ${error}`); return }
    setSections(ss => ss.map(s => s.id === secId ? { ...s, tables: [...s.tables, { ...(table as unknown as FormTable), rows: [] }] } : s))
  }

  async function addTableRow(tableId: string, secId: string, parentId?: string) {
    const tbl = sections.find(s => s.id === secId)?.tables.find(t => t.id === tableId)
    const order = (tbl?.rows.length || 0) + 1
    const { row, error } = await addFormTableRow(tableId, order, parentId)
    if (error || !row) return
    setSections(ss => ss.map(s => s.id === secId ? { ...s, tables: s.tables.map(t => t.id === tableId ? { ...t, rows: [...t.rows, row as unknown as FormTableRow] } : t) } : s))
  }

  function selectField(fieldId: string, secId: string, field: FormField) {
    setSelected({ type: 'field', id: fieldId, sectionId: secId })
    setPropLabel(field.label)
    setPropType(field.field_type)
    setPropRequired(field.is_required)
    setPropPrefill(field.prefill_from_job)
    setPropReadOnly(field.read_only_on_mobile)
    setPropPlaceholder(field.placeholder || '')
    setPropHelp(field.help_text || '')
  }

  async function saveFieldProps() {
    if (!selected || selected.type !== 'field') return
    const updates = { label: propLabel, field_type: propType, is_required: propRequired, prefill_from_job: propPrefill, read_only_on_mobile: propReadOnly, placeholder: propPlaceholder || null, help_text: propHelp || null }
    const { error } = await updateFormField(selected.id, updates)
    if (error) { alert(`Could not save field: ${error}`); return }
    setSections(ss => ss.map(s => s.id === selected.sectionId ? { ...s, fields: s.fields.map(f => f.id === selected.id ? { ...f, ...updates } : f) } : s))
    setSelected(null)
  }

  async function deleteField() {
    if (!selected || selected.type !== 'field') return
    const { error } = await deleteFormField(selected.id)
    if (error) { alert(`Could not delete field: ${error}`); return }
    setSections(ss => ss.map(s => s.id === selected.sectionId ? { ...s, fields: s.fields.filter(f => f.id !== selected.id) } : s))
    setSelected(null)
  }

  // Drag & drop section reordering
  async function handleSectionDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return }
    const reordered = [...sections]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, order_index: i + 1 }))
    setSections(updated)
    setDragIdx(null)
    setDragOverIdx(null)
    await reorderFormSections(updated.map(s => ({ id: s.id, order_index: s.order_index })))
  }

  async function handleSave(status: 'draft' | 'active', forceSwap = false) {
    if (!formId) return
    setSaving(true)
    try {
      if (selected?.type === 'field') {
        const updates = { label: propLabel, field_type: propType, is_required: propRequired, prefill_from_job: propPrefill, read_only_on_mobile: propReadOnly, placeholder: propPlaceholder || null, help_text: propHelp || null }
        await updateFormField(selected.id, updates)
      }
      const fieldCount = sections.reduce((n, s) => n + s.fields.length + s.tables.reduce((m, t) => m + t.rows.length, 0), 0)
      const { error, conflict } = await saveForm(formId, { name: formName, job_type: jobType, status, field_count: fieldCount }, forceSwap)
      if (conflict) { setPublishConflict({ conflictName: conflict.name }); return }
      if (error) { alert(`Save failed: ${error}`); return }
      setIsNewForm(false)
      onSaved()
      onClose()
    } catch (e: unknown) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function confirmPublishSwap() {
    setPublishConflict(null)
    await handleSave('active', true)
  }

  if (!open) return null

  const fi2: React.CSSProperties = { padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%', transition: 'border .15s' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,20,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '96vw', maxWidth: 1000, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', margin: 0 }}>Form Builder</h3>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Form name..." style={{ ...fi2, width: 180, fontSize: 12, padding: '5px 10px' }}/>
            <select value={jobType} onChange={e => setJobType(e.target.value as JobType)} style={{ ...fi2, width: 200, padding: '5px 10px', fontSize: 12 }}>
              {JOB_TYPES.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', marginRight: 8 }}>
              {(['build', 'preview'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--m)' : 'transparent'}`, color: tab === t ? 'var(--m)' : 'var(--txm)', fontFamily: 'Poppins,sans-serif', transition: 'all .15s' }}>
                  {t === 'build' ? 'Builder' : 'Preview'}
                </button>
              ))}
            </div>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txm)', padding: 4, borderRadius: 5, display: 'flex' }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Builder view */}
        {tab === 'build' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Canvas */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F5F3F5' }}>
              {initializing ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--txm)', fontSize: 13 }}>
                  <div style={{ width: 28, height: 28, border: '3px solid var(--gm)', borderTopColor: 'var(--m)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}/>
                  Setting up form…
                </div>
              ) : (
                <>
                  {sections.map((sec, idx) => (
                    <div
                      key={sec.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx) }}
                      onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                      onDrop={() => handleSectionDrop(idx)}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                      style={{ background: '#fff', borderRadius: 10, border: `1.5px solid ${dragOverIdx === idx && dragIdx !== idx ? 'var(--m)' : 'var(--gm)'}`, overflow: 'hidden', marginBottom: 12, opacity: dragIdx === idx ? 0.5 : 1, transition: 'opacity .15s, border-color .15s' }}
                    >
                      {/* Section header */}
                      <div style={{ background: 'var(--mdk)', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Drag handle */}
                        <span title="Drag to reorder" style={{ color: 'rgba(255,255,255,.5)', fontSize: 16, cursor: 'grab', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>⠿</span>
                        <input
                          value={sec.title}
                          onChange={e => updateSectionTitle(sec.id, e.target.value)}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: 'Poppins,sans-serif', cursor: 'text' }}
                          onClick={e => e.stopPropagation()}
                        />
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', flexShrink: 0 }}>§{idx + 1}</span>
                        <button onClick={() => deleteSection(sec.id)} title="Delete section" style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                        </button>
                      </div>

                      <div style={{ padding: 10 }}>
                        {/* Fields */}
                        {sec.fields.map(f => (
                          <div
                            key={f.id}
                            onClick={() => selectField(f.id, sec.id, f)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1.5px solid ${selected?.id === f.id ? 'var(--m)' : 'var(--gm)'}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: selected?.id === f.id ? 'var(--mp)' : '#fff', transition: 'all .15s' }}
                          >
                            <span style={{ color: 'var(--gm)', fontSize: 14, cursor: 'grab', flexShrink: 0 }}>⠿</span>
                            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--gl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: selected?.id === f.id ? 'var(--m)' : 'var(--txm)' }}>
                              {FIELD_TYPES.find(t => t.type === f.field_type)?.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx)' }}>{f.label}</div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: 'var(--gl)', color: 'var(--txm)' }}>{f.field_type}</span>
                                {f.prefill_from_job && <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: '#DBEAFE', color: '#1E40AF' }}>Pre-fill: Job data</span>}
                                {f.is_required && <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: '#FEE2E2', color: '#991B1B' }}>Required</span>}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Tables */}
                        {sec.tables.map(t => (
                          <div key={t.id} style={{ border: '1.5px solid var(--gm)', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--gl)' }}>
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--txm)" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)', flex: 1 }}>Table / Checklist — {t.status_type.replace(/_/g, ' ')}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: 'var(--mp)', color: 'var(--m)', border: '1px solid var(--mb)' }}>{t.rows.filter(r => !r.parent_row_id).length} rows</span>
                            </div>
                            <div style={{ display: 'flex', borderBottom: '1px solid var(--gm)', background: '#FAFAFA' }}>
                              <div style={{ width: 40, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderRight: '1px solid var(--gm)' }}>S.No</div>
                              <div style={{ flex: 1, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderRight: '1px solid var(--gm)' }}>Details</div>
                              {t.status_type === 'yes_no' && <div style={{ width: 60, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', textAlign: 'center', borderRight: '1px solid var(--gm)' }}>Status</div>}
                              {t.status_type === 'tested_not_tested' && <>
                                <div style={{ width: 60, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', textAlign: 'center', borderRight: '1px solid var(--gm)' }}>Tested</div>
                                <div style={{ width: 70, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', textAlign: 'center', borderRight: '1px solid var(--gm)' }}>Not Tested</div>
                              </>}
                              <div style={{ width: 60, padding: '5px 8px', fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', textAlign: 'center' }}>Remarks</div>
                            </div>
                            {t.rows.slice(0, 3).map(row => (
                              <div key={row.id} style={{ display: 'flex', borderBottom: '1px solid var(--gm)', background: row.parent_row_id ? '#fff' : (t.status_type === 'tested_not_tested' ? 'var(--mp)' : '#fff') }}>
                                <div style={{ width: 40, padding: '7px 8px', fontSize: row.parent_row_id ? 10 : 11, fontWeight: row.parent_row_id ? 400 : 600, color: row.parent_row_id ? 'var(--txm)' : 'var(--m)', borderRight: '1px solid var(--gm)', textAlign: 'center' }}>{row.sno_label}</div>
                                <div style={{ flex: 1, padding: '7px 8px', fontSize: 11, color: 'var(--tx)', borderRight: '1px solid var(--gm)', paddingLeft: row.parent_row_id ? 18 : 8, fontStyle: row.parent_row_id ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.row_label}</div>
                                {t.status_type === 'yes_no' && !row.parent_row_id && <div style={{ width: 60, borderRight: '1px solid var(--gm)', display: 'flex', gap: 2, padding: 6, justifyContent: 'center' }}><span style={{ fontSize: 9, fontWeight: 600, padding: '2px 4px', borderRadius: 4, background: '#D1FAE5', color: '#065F46' }}>Y</span><span style={{ fontSize: 9, fontWeight: 600, padding: '2px 4px', borderRadius: 4, background: '#F1F5F9', color: '#475569' }}>N</span></div>}
                                {t.status_type === 'tested_not_tested' && row.parent_row_id && <>
                                  <div style={{ width: 60, borderRight: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="checkbox" style={{ accentColor: 'var(--m)' }} readOnly/></div>
                                  <div style={{ width: 70, borderRight: '1px solid var(--gm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="checkbox" style={{ accentColor: 'var(--m)' }} readOnly/></div>
                                </>}
                                {!(t.status_type === 'yes_no' && !row.parent_row_id) && !(t.status_type === 'tested_not_tested' && row.parent_row_id) && <div style={{ width: t.status_type === 'tested_not_tested' ? 130 : 60, borderRight: '1px solid var(--gm)' }}/>}
                                <div style={{ width: 60 }}/>
                              </div>
                            ))}
                            {t.rows.length > 3 && (
                              <div style={{ display: 'flex', borderBottom: '1px solid var(--gm)', background: 'var(--gl)' }}>
                                <div style={{ width: 40, padding: '5px 8px', borderRight: '1px solid var(--gm)', textAlign: 'center', color: 'var(--txm)', fontSize: 10 }}>…</div>
                                <div style={{ flex: 1, padding: '5px 8px', fontSize: 10, color: 'var(--txm)' }}>{t.rows.length - 3} more rows</div>
                              </div>
                            )}
                            <div style={{ padding: '7px 10px', borderTop: '1px solid var(--gm)', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 11, color: 'var(--txm)' }}>{t.rows.length} rows total</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => addTableRow(t.id, sec.id)} style={{ padding: '3px 10px', fontSize: 10, border: '1px solid var(--gm)', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>+ Add row</button>
                                {t.has_subrows && <button onClick={() => { const mainRow = t.rows.filter(r => !r.parent_row_id).at(-1); if (mainRow) addTableRow(t.id, sec.id, mainRow.id) }} style={{ padding: '3px 10px', fontSize: 10, border: '1px solid var(--gm)', borderRadius: 6, background: '#fff', cursor: 'pointer', fontFamily: 'Poppins,sans-serif' }}>+ Add sub-row</button>}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Add field button */}
                        <div
                          onClick={() => addField(sec.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: '1.5px dashed var(--gm)', borderRadius: 8, cursor: 'pointer', color: 'var(--txm)', fontSize: 11, transition: 'all .15s', marginTop: 4 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLDivElement).style.color='var(--m)'; (e.currentTarget as HTMLDivElement).style.background='var(--mp)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--gm)'; (e.currentTarget as HTMLDivElement).style.color='var(--txm)'; (e.currentTarget as HTMLDivElement).style.background='' }}
                        >
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Add field to this section
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add section */}
                  {!initializing && (
                    <div
                      onClick={addSection}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '2px dashed var(--gm)', borderRadius: 10, cursor: 'pointer', color: 'var(--txm)', fontSize: 12, fontWeight: 500, transition: 'all .15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLDivElement).style.color='var(--m)'; (e.currentTarget as HTMLDivElement).style.background='var(--mp)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--gm)'; (e.currentTarget as HTMLDivElement).style.color='var(--txm)'; (e.currentTarget as HTMLDivElement).style.background='' }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add new section
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right pane: palette / properties */}
            <div style={{ width: 260, flexShrink: 0, background: '#fff', borderLeft: '1px solid var(--gm)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!selected ? (
                <>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Add to form</div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Field types</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                      {FIELD_TYPES.map(ft => (
                        <button key={ft.type}
                          onClick={() => { const sec = sections[0]; if (sec) addField(sec.id, ft.type) }}
                          title={`Add ${ft.label} to first section`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 6px', border: '1.5px solid var(--gm)', borderRadius: 8, cursor: 'pointer', background: '#fff', transition: 'all .15s', fontFamily: 'Poppins,sans-serif', color: 'var(--txm)', fontSize: 10, fontWeight: 500 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLButtonElement).style.background='var(--mp)'; (e.currentTarget as HTMLButtonElement).style.color='var(--m)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--gm)'; (e.currentTarget as HTMLButtonElement).style.background='#fff'; (e.currentTarget as HTMLButtonElement).style.color='var(--txm)' }}
                        >
                          {ft.icon}
                          <span>{ft.label}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Structure</div>
                    <button onClick={addSection} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 8, cursor: 'pointer', background: '#fff', marginBottom: 6, transition: 'all .15s', fontFamily: 'Poppins,sans-serif', fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLButtonElement).style.background='var(--mp)'; (e.currentTarget as HTMLButtonElement).style.color='var(--m)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--gm)'; (e.currentTarget as HTMLButtonElement).style.background='#fff'; (e.currentTarget as HTMLButtonElement).style.color='var(--txm)' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                      New section
                    </button>
                    <button onClick={() => { const sec = sections[0]; if (sec) addTableBlock(sec.id) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 8, cursor: 'pointer', background: '#fff', marginBottom: 12, transition: 'all .15s', fontFamily: 'Poppins,sans-serif', fontSize: 11, fontWeight: 500, color: 'var(--txm)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--m)'; (e.currentTarget as HTMLButtonElement).style.background='var(--mp)'; (e.currentTarget as HTMLButtonElement).style.color='var(--m)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--gm)'; (e.currentTarget as HTMLButtonElement).style.background='#fff'; (e.currentTarget as HTMLButtonElement).style.color='var(--txm)' }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
                      Table / Checklist block
                    </button>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Tips</div>
                    <div style={{ fontSize: 10, color: 'var(--txm)', lineHeight: 1.6, background: 'var(--gl)', borderRadius: 7, padding: '8px 10px' }}>
                      Drag the <strong>⠿</strong> handle in each section header to reorder sections.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gm)', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Field properties</span>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--txm)' }}>←</button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Field label</div>
                      <input value={propLabel} onChange={e => setPropLabel(e.target.value)} style={{ padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}/>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Field type</div>
                      <select value={propType} onChange={e => setPropType(e.target.value as FieldType)} style={{ padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}>
                        {FIELD_TYPES.map(ft => <option key={ft.type} value={ft.type}>{ft.label}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Field options</div>
                      {[
                        { label: 'Required field', val: propRequired, set: setPropRequired },
                        { label: 'Pre-fill from job data', val: propPrefill, set: setPropPrefill },
                        { label: 'Read-only on mobile', val: propReadOnly, set: setPropReadOnly },
                      ].map(({ label, val, set }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--gl)', borderRadius: 7, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--tx)' }}>{label}</span>
                          <div onClick={() => set(!val)} className={`toggle-sw${val ? '' : ' off'}`}/>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Placeholder text</div>
                      <input value={propPlaceholder} onChange={e => setPropPlaceholder(e.target.value)} placeholder="Hint shown to engineer" style={{ padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}/>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Help text</div>
                      <input value={propHelp} onChange={e => setPropHelp(e.target.value)} placeholder="Optional guidance" style={{ padding: '8px 10px', border: '1.5px solid var(--gm)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', outline: 'none', fontFamily: 'Poppins,sans-serif', width: '100%' }}/>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={saveFieldProps} style={{ flex: 1, padding: '7px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>Save</button>
                      <button onClick={deleteField} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: 'var(--red)', cursor: 'pointer', fontSize: 11, fontFamily: 'Poppins,sans-serif' }}>Delete field</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Preview tab */}
        {tab === 'preview' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#F5F3F5' }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <div style={{ background: 'var(--mdk)', borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>EMR</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{formName || 'Form'}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid var(--gm)', marginBottom: 10, fontSize: 11, color: 'var(--txm)', textAlign: 'center' }}>
                Preview — how this form appears on the mobile app
              </div>
              {sections.map(sec => (
                <div key={sec.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gm)', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ background: 'var(--mdk)', padding: '9px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '.5px' }}>{sec.title}</span>
                  </div>
                  <div style={{ padding: sec.tables.length > 0 && sec.fields.length === 0 ? 0 : 14 }}>
                    {sec.fields.map(f => (
                      <div key={f.id} style={{ marginBottom: 10 }}>
                        {f.field_type !== 'checkbox' && (
                          <label style={{ fontSize: 10, color: 'var(--txm)', display: 'block', marginBottom: 3 }}>
                            {f.label}{f.is_required && <span style={{ color: 'var(--red)' }}> *</span>}
                          </label>
                        )}
                        {f.prefill_from_job ? (
                          <div style={{ background: 'var(--gl)', border: '1px solid var(--gm)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'var(--txm)' }}>Auto-filled from job</div>
                        ) : f.field_type === 'long_text' ? (
                          <textarea readOnly rows={2} placeholder={f.placeholder || 'Enter text…'} style={{ width: '100%', border: '1.5px solid var(--gm)', borderRadius: 7, padding: '8px 10px', fontSize: 12, fontFamily: 'Poppins,sans-serif', resize: 'none', outline: 'none', color: 'var(--tx)' }}/>
                        ) : f.field_type === 'signature' ? (
                          <div style={{ border: '1.5px dashed var(--gm)', borderRadius: 7, padding: '20px', textAlign: 'center', fontSize: 11, color: 'var(--txm)' }}>Tap to sign</div>
                        ) : f.field_type === 'photo' ? (
                          <div style={{ border: '1.5px dashed var(--gm)', borderRadius: 7, padding: '16px', textAlign: 'center', fontSize: 11, color: 'var(--txm)' }}>Tap to capture photo</div>
                        ) : f.field_type === 'checkbox' ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><input type="checkbox" style={{ accentColor: 'var(--m)' }}/>{f.label}</label>
                        ) : (
                          <input type={f.field_type === 'date' ? 'date' : 'text'} placeholder={f.placeholder || ''} readOnly={f.read_only_on_mobile} style={{ width: '100%', border: '1.5px solid var(--gm)', borderRadius: 7, padding: '8px 10px', fontSize: 12, fontFamily: 'Poppins,sans-serif', outline: 'none', color: 'var(--tx)' }}/>
                        )}
                      </div>
                    ))}
                    {sec.tables.map(t => (
                      <table key={t.id} style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F5F3F5' }}>
                            <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', width: 44, textAlign: 'center' }}>S.No</th>
                            <th style={{ padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', textAlign: 'left' }}>Details</th>
                            {t.status_type === 'yes_no' && <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', width: 110, textAlign: 'center' }}>Status</th>}
                            {t.status_type === 'tested_not_tested' && <>
                              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', width: 70, textAlign: 'center' }}>Tested</th>
                              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', width: 80, textAlign: 'center' }}>Not Tested</th>
                            </>}
                            <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 600, color: 'var(--txm)', textTransform: 'uppercase', borderBottom: '1px solid var(--gm)', width: 100, textAlign: 'left' }}>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.map((row, ri) => {
                            const isSub = !!row.parent_row_id
                            const isParent = !isSub
                            return (
                              <tr key={row.id} style={{ background: ri % 2 === 0 ? 'var(--mp)' : '#fff', borderBottom: '1px solid var(--gm)' }}>
                                <td style={{ padding: isSub ? '7px 10px' : '10px', textAlign: 'center', fontSize: isSub ? 11 : 12, fontWeight: isParent ? 700 : 400, color: isParent ? 'var(--m)' : 'var(--txm)' }}>{row.sno_label}</td>
                                <td style={{ padding: isSub ? '8px 12px 8px 22px' : '10px 12px', fontSize: isSub ? 11 : 12, fontWeight: isParent ? 500 : 400, color: 'var(--tx)', fontStyle: isSub ? 'italic' : 'normal' }}>{row.row_label}</td>
                                {t.status_type === 'yes_no' && (
                                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    {isParent && <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                      <span style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 600 }}>Yes</span>
                                      <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 600 }}>No</span>
                                    </div>}
                                  </td>
                                )}
                                {t.status_type === 'tested_not_tested' && <>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{isSub && <input type="checkbox" style={{ width: 15, height: 15, accentColor: '#059669' }} readOnly/>}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{isSub && <input type="checkbox" style={{ width: 15, height: 15, accentColor: '#D97706' }} readOnly/>}</td>
                                </>}
                                <td style={{ padding: '8px 10px' }}>
                                  {(t.status_type === 'yes_no' || isSub) && <input style={{ width: '100%', border: '1px solid var(--gm)', borderRadius: 5, padding: '4px 7px', fontSize: 11, fontFamily: 'Poppins,sans-serif', outline: 'none' }} placeholder="Remarks" readOnly/>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--gm)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#FAFAFA', flexShrink: 0 }}>
          <button onClick={handleClose} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
          <button onClick={() => handleSave('draft')} disabled={saving || initializing} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--txm)', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif', opacity: (saving || initializing) ? .5 : 1 }}>Save as draft</button>
          <button onClick={() => setTab('preview')} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Preview on mobile</button>
          <button onClick={() => handleSave('active')} disabled={saving || initializing} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif', opacity: (saving || initializing) ? .7 : 1 }}>{saving ? 'Saving…' : 'Publish form'}</button>
        </div>
      </div>

      {/* Publish conflict confirmation */}
      {publishConflict && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 8 }}>Cannot assign two forms for one Job Type</div>
            <div style={{ fontSize: 12, color: 'var(--txm)', marginBottom: 20, lineHeight: 1.6 }}>
              Publishing <strong>{formName}</strong> will unpublish <strong>{publishConflict.conflictName}</strong>. Continue?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPublishConflict(null)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gm)', background: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'Poppins,sans-serif' }}>Cancel</button>
              <button onClick={confirmPublishSwap} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--m)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'Poppins,sans-serif' }}>Yes, publish</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
