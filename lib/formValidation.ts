// Lightweight per-field format validation for job forms. Fields are NOT mandatory
// (an engineer may submit any subset), so an empty value is always fine — this only
// rejects a value that IS filled but malformed for its type: numbers, dates, and email
// (email has no dedicated field_type, so it's detected by the field label). Mirrored in
// the RN app at mobile-native/src/lib/formValidation.ts.

interface ValidatableField {
  id: string
  label: string
  field_type?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateFieldValue(field: ValidatableField, raw: string): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null // empty is allowed (no mandatory fields)
  if (field.field_type === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return 'Enter a valid number'
  } else if (field.field_type === 'date') {
    if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) return 'Use date format YYYY-MM-DD'
  } else if (/e-?mail/i.test(field.label || '')) {
    if (!EMAIL_RE.test(v)) return 'Enter a valid email address'
  }
  return null
}

// Returns { fieldId: errorMessage } for every filled-but-invalid field in the form.
export function validateForm(
  sections: { fields: ValidatableField[] }[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const section of sections) {
    for (const field of section.fields) {
      const err = validateFieldValue(field, values[field.id] || '')
      if (err) errors[field.id] = err
    }
  }
  return errors
}
