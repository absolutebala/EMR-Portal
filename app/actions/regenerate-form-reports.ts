'use server'

import { adminClient } from '@/lib/db/admin-client'
import { regenerateFormReportsCore } from '@/lib/mobile/core/workOrders'

// Re-renders the PDF/Word report for every existing submission of a form using the
// current template generators. Admin-triggered from the Forms page so template changes
// reach forms submitted before the change (whose files were frozen at submit time).
export async function regenerateFormReports(formId: string): Promise<{ error: string | null; regenerated: number; total: number }> {
  return regenerateFormReportsCore(adminClient(), formId)
}
