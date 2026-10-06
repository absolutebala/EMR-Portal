// Single source of truth for how a transformer's warranty is classified — used by the
// dashboard's "Customers on warranty" counts (app/actions/get-dashboard.ts) and the
// Customers page's warranty filter (app/(app)/customers/page.tsx) so they can never
// drift apart.
//
// No Warranty ('expired') means ANY of: status explicitly 'expired'; no warranty
// information on record (missing dispatch date or warranty years, so there's nothing to
// honour); or the warranty period (dispatch date + warranty years) has already lapsed.
// Otherwise it's Under Warranty, and `expiringSoon` additionally flags the subset whose
// warranty runs out within the next 90 days.

export interface WarrantyInput {
  warranty_status: string | null
  dispatch_date: string | null
  warranty_years: number | null
}

export function classifyWarranty(t: WarrantyInput, nowMs: number): { bucket: 'under_warranty' | 'expired'; expiringSoon: boolean } {
  if (t.warranty_status === 'expired') return { bucket: 'expired', expiringSoon: false }
  if (!t.dispatch_date || t.warranty_years == null) return { bucket: 'expired', expiringSoon: false }
  const exp = new Date(t.dispatch_date)
  exp.setFullYear(exp.getFullYear() + t.warranty_years)
  const expMs = exp.getTime()
  if (Number.isNaN(expMs) || expMs < nowMs) return { bucket: 'expired', expiringSoon: false }
  const in90Ms = nowMs + 90 * 24 * 60 * 60 * 1000
  return { bucket: 'under_warranty', expiringSoon: expMs <= in90Ms }
}
