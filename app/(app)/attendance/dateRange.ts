// Shared by the server page (computes the default "This Week" range for the initial
// fetch) and the client component (recomputes on every view-mode/nav change).
export type ViewMode = 'week' | 'month' | 'custom'

export function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export function getRange(mode: ViewMode, anchor: Date, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  if (mode === 'week') {
    const dow = anchor.getDay()
    const start = new Date(anchor); start.setDate(anchor.getDate() - dow)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return {
      from: toDateStr(start),
      to: toDateStr(end),
      label: `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    }
  }
  if (mode === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return { from: toDateStr(start), to: toDateStr(end), label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }
  }
  return { from: customFrom, to: customTo, label: '' }
}
