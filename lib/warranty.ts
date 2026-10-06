// Single source of truth for how a transformer's warranty is classified — used by the
// dashboard's "Customers on warranty" counts (app/actions/get-dashboard.ts) and the
// Customers page's warranty filter (app/(app)/customers/page.tsx) so they can never
// drift apart.
//
// Bucket is driven by the stored warranty_status (the same value shown on the customer
// detail page), NOT computed from dates: No Warranty ('expired') = status 'expired';
// everything else is Under Warranty. `expiringSoon` is an informational flag for the
// subset whose warranty runs out within 90 days — only set when dispatch date + warranty
// years are on record, and it never changes the Under-vs-No-Warranty bucket.

export interface WarrantyInput {
  warranty_status: string | null
  dispatch_date: string | null
  warranty_years: number | null
}

export function classifyWarranty(t: WarrantyInput, nowMs: number): { bucket: 'under_warranty' | 'expired'; expiringSoon: boolean } {
  if (t.warranty_status === 'expired') return { bucket: 'expired', expiringSoon: false }
  let expiringSoon = false
  if (t.dispatch_date && t.warranty_years != null) {
    const exp = new Date(t.dispatch_date)
    exp.setFullYear(exp.getFullYear() + t.warranty_years)
    const expMs = exp.getTime()
    const in90Ms = nowMs + 90 * 24 * 60 * 60 * 1000
    if (!Number.isNaN(expMs) && expMs >= nowMs && expMs <= in90Ms) expiringSoon = true
  }
  return { bucket: 'under_warranty', expiringSoon }
}
