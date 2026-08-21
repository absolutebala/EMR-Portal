'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getEngineerAnalyticsDrilldownCore } from '@/lib/mobile/core/analytics'

export interface EngineerAnalyticsRow {
  id: string
  name: string
  employeeId: string
  assigned: number
  resolved: number
  reassigned: number
  expenseTotal: number
  present: number
  leave: number
}

export type AnalyticsMetric = 'assigned' | 'resolved' | 'reassigned' | 'expenses' | 'present' | 'leave'

export interface AnalyticsDrilldownRow {
  id: string
  woNumber: string | null
  customerName: string | null
  status: string | null
  date: string | null
  amount: number | null
}

// month is 'YYYY-MM'. Returns the first-of-month date and the first-of-next-month
// date (exclusive upper bound) — used both as plain dates (for date columns) and,
// with a time suffix, as timestamptz bounds (for created_at/updated_at columns).
function monthRange(month: string): { startDate: string; endDateExclusive: string } {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { startDate: iso(start), endDateExclusive: iso(end) }
}

export async function getUserAnalyticsOverview(month: string): Promise<{ rows: EngineerAnalyticsRow[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { startDate, endDateExclusive } = monthRange(month)
    const startTs = `${startDate}T00:00:00.000Z`
    const endTs = `${endDateExclusive}T00:00:00.000Z`

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, first_name, last_name, employee_id')
      .eq('role', 'Field Engineer')
      .eq('is_active', true)
      .order('first_name')
    if (profErr) return { rows: [], error: profErr.message }
    if (!profiles?.length) return { rows: [], error: null }

    const ids = profiles.map(p => p.id)

    const [{ data: assignedRows }, { data: resolvedRows }, { data: reassignedRows }, { data: expenseRows }, { data: attendanceRows }] = await Promise.all([
      admin.from('work_orders').select('engineer_id').in('engineer_id', ids).gte('scheduled_date', startDate).lt('scheduled_date', endDateExclusive),
      admin.from('work_orders').select('engineer_id').in('engineer_id', ids).eq('status', 'completed').gte('updated_at', startTs).lt('updated_at', endTs),
      admin.from('work_order_daily_closures').select('engineer_id').in('engineer_id', ids).eq('needs_reassignment', true).gte('created_at', startTs).lt('created_at', endTs),
      admin.from('expense_logs').select('engineer_id, amount').in('engineer_id', ids).gte('expense_date', startDate).lt('expense_date', endDateExclusive),
      admin.from('attendance').select('engineer_id, status').in('engineer_id', ids).gte('attendance_date', startDate).lt('attendance_date', endDateExclusive),
    ])

    const rowsById = new Map<string, EngineerAnalyticsRow>()
    for (const p of profiles) {
      rowsById.set(p.id, { id: p.id, name: `${p.first_name} ${p.last_name}`, employeeId: p.employee_id, assigned: 0, resolved: 0, reassigned: 0, expenseTotal: 0, present: 0, leave: 0 })
    }
    for (const r of assignedRows || []) { const row = r.engineer_id && rowsById.get(r.engineer_id); if (row) row.assigned++ }
    for (const r of resolvedRows || []) { const row = r.engineer_id && rowsById.get(r.engineer_id); if (row) row.resolved++ }
    for (const r of reassignedRows || []) { const row = r.engineer_id && rowsById.get(r.engineer_id); if (row) row.reassigned++ }
    for (const r of expenseRows || []) { const row = r.engineer_id && rowsById.get(r.engineer_id); if (row) row.expenseTotal += Number(r.amount) }
    for (const r of attendanceRows || []) {
      const row = r.engineer_id && rowsById.get(r.engineer_id)
      if (!row) continue
      if (r.status === 'present') row.present++
      else if (r.status === 'leave') row.leave++
    }

    return { rows: profiles.map(p => rowsById.get(p.id)!), error: null }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Thin wrapper — the actual query logic lives in lib/mobile/core/analytics.ts
// (getEngineerAnalyticsDrilldownCore), shared with the PWA/RN personal "My
// Analytics" screens' own drilldown.
export async function getUserAnalyticsDrilldown(engineerId: string, month: string, metric: AnalyticsMetric): Promise<{ rows: AnalyticsDrilldownRow[]; error: string | null }> {
  return getEngineerAnalyticsDrilldownCore(adminClient(), engineerId, month, metric)
}
