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

// A date is valid if it's DD/MM/YYYY (current format, entered via the picker) or the
// legacy YYYY-MM-DD, and the calendar date actually exists (e.g. rejects 31/02/2026).
function isValidDate(v: string): boolean {
  let d: number, mo: number, y: number
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3] }
  else { m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false; y = +m[1]; mo = +m[2]; d = +m[3] }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

export function validateFieldValue(field: ValidatableField, raw: string): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null // empty is allowed (no mandatory fields)
  if (field.field_type === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return 'Enter a valid number'
  } else if (field.field_type === 'date') {
    if (!isValidDate(v)) return 'Use date format DD/MM/YYYY'
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
