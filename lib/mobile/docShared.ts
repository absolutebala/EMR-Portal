// Shared helpers for the bespoke per-form document generators (PDF via pdfkit,
// Word via docx). Form-independent: colour tokens, signature/date helpers, and a
// label→value flattener over the submitted form data.
import { EMR_LOGO_BUFFER } from './emrLogo'
import type { VisitPdfParams } from './generateVisitPdf'

export { EMR_LOGO_BUFFER }
export const LOGO_ASPECT = 1409 / 407

export const COLORS = {
  red: '#D5271F',
  blue: '#2F6FE0',
  grayBg: '#E8E8ED',
  line: '#111111',
  ink: '#1C0D14',
  muted: '#777777',
}

export function dataUrlToBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null
  try {
    const base64 = dataUrl.split(',')[1] ?? dataUrl
    return Buffer.from(base64, 'base64')
  } catch { return null }
}

// Renders yyyy-mm-dd values as "dd Mon yyyy"; leaves everything else as-is.
export function fmtVal(v: string | undefined | null): string {
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00')
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return v
}

// Flattens every filled field value into a label→value map. Labels are unique
// within a single form, so this is a reliable lookup for template slot mapping.
export function buildByLabel(params: VisitPdfParams): Record<string, string> {
  const m: Record<string, string> = {}
  for (const sec of params.sections) {
    for (const f of sec.fields) {
      const v = params.fieldValues[f.id]
      if (v != null && v !== '') m[f.label] = v
    }
  }
  return m
}

// Human label for a table row status code (mirrors the on-screen form controls).
export function rowStatusLabel(code: string, col1?: string | null, col2?: string | null): string {
  switch (code) {
    case 'yes': return 'Yes'
    case 'no': return 'No'
    case 'tested': return 'Tested'
    case 'not_tested': return 'Not Tested'
    case 'progress': return 'In Progress'
    case 'completed': return 'Completed'
    case 'na': return 'N/A'
    case 'checked': return 'Yes'
    case 'col1': return col1 || 'Yes'
    case 'col2': return col2 || 'No'
    case 'pass': return 'Pass'
    case 'fail': return 'Fail'
    default: return code
  }
}
