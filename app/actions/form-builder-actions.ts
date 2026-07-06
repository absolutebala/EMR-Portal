'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Default sections added to every new form — one per field type
const DEFAULT_SECTIONS = [
  { title: 'General Information',      fieldType: 'text',      fieldLabel: 'Name / Description' },
  { title: 'Measurements & Numbers',   fieldType: 'number',    fieldLabel: 'Value' },
  { title: 'Notes & Remarks',          fieldType: 'long_text', fieldLabel: 'Remarks' },
  { title: 'Selection',                fieldType: 'dropdown',  fieldLabel: 'Select option' },
  { title: 'Date & Time',              fieldType: 'date',      fieldLabel: 'Date' },
  { title: 'Photos',                   fieldType: 'photo',     fieldLabel: 'Attach photo' },
  { title: 'Signature',                fieldType: 'signature', fieldLabel: 'Sign here' },
  { title: 'Checklist',                fieldType: 'checkbox',  fieldLabel: 'Check item' },
]

export async function createFormWithDefaults(payload: {
  name: string
  job_type: string
}): Promise<{ error: string | null; id?: string }> {
  try {
    const sb = adminClient()

    const { data: form, error: formErr } = await sb
      .from('forms')
      .insert({ name: payload.name || 'Untitled', job_type: payload.job_type, status: 'draft', field_count: DEFAULT_SECTIONS.length })
      .select('id')
      .single()

    if (formErr || !form) return { error: formErr?.message || 'Failed to create form.' }

    for (let i = 0; i < DEFAULT_SECTIONS.length; i++) {
      const sec = DEFAULT_SECTIONS[i]
      const { data: section } = await sb
        .from('form_sections')
        .insert({ form_id: form.id, title: sec.title, order_index: i + 1 })
        .select('id')
        .single()

      if (section) {
        await sb.from('form_fields').insert({
          section_id: section.id,
          label: sec.fieldLabel,
          field_type: sec.fieldType,
          is_required: false,
          prefill_from_job: false,
          read_only_on_mobile: false,
          order_index: 1,
        })
      }
    }

    return { error: null, id: form.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addFormSection(
  formId: string,
  title: string,
  orderIndex: number
): Promise<{ error: string | null; section?: { id: string; form_id: string; title: string; order_index: number } }> {
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('form_sections')
      .insert({ form_id: formId, title, order_index: orderIndex })
      .select()
      .single()
    return { error: error?.message || null, section: data || undefined }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateFormSectionTitle(
  sectionId: string,
  title: string
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('form_sections').update({ title }).eq('id', sectionId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteFormSection(sectionId: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('form_sections').delete().eq('id', sectionId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addFormField(
  sectionId: string,
  fieldType: string,
  orderIndex: number
): Promise<{ error: string | null; field?: Record<string, unknown> }> {
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('form_fields')
      .insert({
        section_id: sectionId,
        label: 'New field',
        field_type: fieldType,
        is_required: false,
        prefill_from_job: false,
        read_only_on_mobile: false,
        order_index: orderIndex,
      })
      .select()
      .single()
    return { error: error?.message || null, field: data || undefined }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateFormField(
  fieldId: string,
  updates: {
    label?: string
    field_type?: string
    is_required?: boolean
    prefill_from_job?: boolean
    read_only_on_mobile?: boolean
    placeholder?: string | null
    help_text?: string | null
  }
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('form_fields').update(updates).eq('id', fieldId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteFormField(fieldId: string): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    const { error } = await sb.from('form_fields').delete().eq('id', fieldId)
    return { error: error?.message || null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addFormTable(
  sectionId: string,
  orderIndex: number
): Promise<{ error: string | null; table?: Record<string, unknown> }> {
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('form_tables')
      .insert({ section_id: sectionId, status_type: 'yes_no', has_subrows: false, order_index: orderIndex })
      .select()
      .single()
    return { error: error?.message || null, table: data || undefined }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function addFormTableRow(
  tableId: string,
  orderIndex: number,
  parentId?: string
): Promise<{ error: string | null; row?: Record<string, unknown> }> {
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('form_table_rows')
      .insert({
        table_id: tableId,
        row_label: 'New row',
        sno_label: String(orderIndex),
        order_index: orderIndex,
        parent_row_id: parentId || null,
      })
      .select()
      .single()
    return { error: error?.message || null, row: data || undefined }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function reorderFormSections(
  updates: { id: string; order_index: number }[]
): Promise<{ error: string | null }> {
  try {
    const sb = adminClient()
    await Promise.all(
      updates.map(u => sb.from('form_sections').update({ order_index: u.order_index }).eq('id', u.id))
    )
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
