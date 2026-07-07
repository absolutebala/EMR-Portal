'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server configuration error.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface DefaultField {
  label: string
  fieldType: string
  isRequired?: boolean
  prefillFromJob?: boolean
}

interface DefaultSection {
  title: string
  fields: DefaultField[]
}

// Default sections for every new form. Customer Information mirrors the MOM form.
const DEFAULT_SECTIONS: DefaultSection[] = [
  {
    title: 'Customer Information',
    fields: [
      { label: 'Customer Name',        fieldType: 'text',      isRequired: true,  prefillFromJob: true },
      { label: 'Contact Number',       fieldType: 'text',      isRequired: true,  prefillFromJob: true },
      { label: 'Installation Location',fieldType: 'text',      isRequired: true,  prefillFromJob: true },
      { label: 'Project Details',      fieldType: 'long_text', isRequired: false, prefillFromJob: false },
    ],
  },
  { title: 'Measurements & Numbers', fields: [{ label: 'Value',         fieldType: 'number'    }] },
  { title: 'Notes & Remarks',        fields: [{ label: 'Remarks',       fieldType: 'long_text' }] },
  { title: 'Selection',              fields: [{ label: 'Select option', fieldType: 'dropdown'  }] },
  { title: 'Date & Time',            fields: [{ label: 'Date',          fieldType: 'date'      }] },
  { title: 'Photos',                 fields: [{ label: 'Attach photo',  fieldType: 'photo'     }] },
  { title: 'Signature',              fields: [{ label: 'Sign here',     fieldType: 'signature' }] },
  { title: 'Checklist',              fields: [{ label: 'Check item',    fieldType: 'checkbox'  }] },
]

export async function createFormWithDefaults(payload: {
  name: string
  job_type: string
}): Promise<{ error: string | null; id?: string }> {
  try {
    const sb = adminClient()

    const totalFields = DEFAULT_SECTIONS.reduce((n, s) => n + s.fields.length, 0)
    const { data: form, error: formErr } = await sb
      .from('forms')
      .insert({ name: payload.name || 'Untitled', job_type: payload.job_type, status: 'draft', field_count: totalFields })
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
        await sb.from('form_fields').insert(
          sec.fields.map((f, fi) => ({
            section_id: section.id,
            label: f.label,
            field_type: f.fieldType,
            is_required: f.isRequired ?? false,
            prefill_from_job: f.prefillFromJob ?? false,
            read_only_on_mobile: false,
            order_index: fi + 1,
          }))
        )
      }
    }

    return { error: null, id: form.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getFormData(formId: string) {
  try {
    const sb = adminClient()
    const { data: secs, error } = await sb.from('form_sections').select('*').eq('form_id', formId).order('order_index')
    if (error) return { error: error.message, data: null }
    const fullSecs = await Promise.all((secs || []).map(async (sec: { id: string; form_id: string; title: string; order_index: number }) => {
      const [{ data: fields }, { data: tables }] = await Promise.all([
        sb.from('form_fields').select('*').eq('section_id', sec.id).order('order_index'),
        sb.from('form_tables').select('*').eq('section_id', sec.id).order('order_index'),
      ])
      const tablesWithRows = await Promise.all((tables || []).map(async (t: { id: string }) => {
        const { data: rows } = await sb.from('form_table_rows').select('*').eq('table_id', t.id).order('order_index')
        return { ...t, rows: rows || [] }
      }))
      return { ...sec, fields: fields || [], tables: tablesWithRows }
    }))
    return { data: fullSecs, error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e), data: null }
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
