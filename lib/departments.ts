export interface Department {
  id: string
  name: string
}

// The "service item number" field on a notification is labelled by department:
// OLTC SI. No. / NIFPS SI. No. / Breather SI. No., defaulting to a generic "SI. No."
// when the department doesn't match one of those product lines.
export function siNoLabel(departmentName?: string | null): string {
  const n = (departmentName || '').toLowerCase()
  if (n.includes('oltc')) return 'OLTC SI. No.'
  if (n.includes('nifps') || n.includes('nips')) return 'NIFPS SI. No.'
  if (n.includes('breather')) return 'Breather SI. No.'
  return 'SI. No.'
}
