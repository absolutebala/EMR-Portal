'use server'

import { createClient } from '@supabase/supabase-js'

export async function duplicateForm(formId: string, newName: string): Promise<{ error: string | null; newFormId?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return { error: 'Server configuration error.' }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch source form
  const { data: form, error: formErr } = await supabase.from('forms').select('*').eq('id', formId).single()
  if (formErr || !form) return { error: 'Form not found.' }

  // Create new form as draft
  const { data: newForm, error: newFormErr } = await supabase.from('forms').insert({
    name: newName,
    job_type: form.job_type,
    status: 'draft',
    field_count: form.field_count,
  }).select().single()
  if (newFormErr || !newForm) return { error: newFormErr?.message || 'Failed to create form.' }

  // Copy sections
  const { data: sections } = await supabase.from('form_sections').select('*').eq('form_id', formId).order('order_index')
  for (const sec of sections || []) {
    const { data: newSec } = await supabase.from('form_sections').insert({
      form_id: newForm.id, title: sec.title, order_index: sec.order_index,
    }).select().single()
    if (!newSec) continue

    // Copy fields
    const { data: fields } = await supabase.from('form_fields').select('*').eq('section_id', sec.id).order('order_index')
    for (const f of fields || []) {
      await supabase.from('form_fields').insert({
        section_id: newSec.id, label: f.label, field_type: f.field_type,
        is_required: f.is_required, prefill_from_job: f.prefill_from_job,
        read_only_on_mobile: f.read_only_on_mobile, placeholder: f.placeholder,
        help_text: f.help_text, order_index: f.order_index,
      })
    }

    // Copy table blocks and rows
    const { data: tables } = await supabase.from('form_tables').select('*').eq('section_id', sec.id).order('order_index')
    for (const t of tables || []) {
      const { data: newTable } = await supabase.from('form_tables').insert({
        section_id: newSec.id, status_type: t.status_type,
        has_subrows: t.has_subrows, order_index: t.order_index,
      }).select().single()
      if (!newTable) continue

      const { data: rows } = await supabase.from('form_table_rows').select('*').eq('table_id', t.id).order('order_index')
      const rowIdMap: Record<string, string> = {}
      for (const r of rows || []) {
        const { data: newRow } = await supabase.from('form_table_rows').insert({
          table_id: newTable.id, row_label: r.row_label, sno_label: r.sno_label,
          order_index: r.order_index,
          parent_row_id: r.parent_row_id ? (rowIdMap[r.parent_row_id] || null) : null,
        }).select().single()
        if (newRow) rowIdMap[r.id] = newRow.id
      }
    }
  }

  return { error: null, newFormId: newForm.id }
}
