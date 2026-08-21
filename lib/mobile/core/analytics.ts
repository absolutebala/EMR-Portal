import type { AdminClient } from './shared'

export interface EngineerAnalyticsSummary {
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

// Single-engineer version of the same six metrics the desktop User Analytics table
// computes org-wide (lib/mobile/core/analytics.ts is the canonical definition —
// desktop's batched multi-engineer overview in app/actions/user-analytics.ts stays
// separate for efficiency, but uses the identical metric definitions). Backs both
// the PWA and RN "My Analytics" personal screens.
export async function getEngineerAnalyticsSummaryCore(admin: AdminClient, engineerId: string, month: string): Promise<{ summary: EngineerAnalyticsSummary; error: string | null }> {
  try {
    const { startDate, endDateExclusive } = monthRange(month)
    const startTs = `${startDate}T00:00:00.000Z`
    const endTs = `${endDateExclusive}T00:00:00.000Z`

    const [{ data: assignedRows, error: e1 }, { data: resolvedRows, error: e2 }, { data: reassignedRows, error: e3 }, { data: expenseRows, error: e4 }, { data: attendanceRows, error: e5 }] = await Promise.all([
      admin.from('work_orders').select('id').eq('engineer_id', engineerId).gte('scheduled_date', startDate).lt('scheduled_date', endDateExclusive),
      admin.from('work_orders').select('id').eq('engineer_id', engineerId).eq('status', 'completed').gte('updated_at', startTs).lt('updated_at', endTs),
      admin.from('work_order_daily_closures').select('id').eq('engineer_id', engineerId).eq('needs_reassignment', true).gte('created_at', startTs).lt('created_at', endTs),
      admin.from('expense_logs').select('amount').eq('engineer_id', engineerId).gte('expense_date', startDate).lt('expense_date', endDateExclusive),
      admin.from('attendance').select('status').eq('engineer_id', engineerId).gte('attendance_date', startDate).lt('attendance_date', endDateExclusive),
    ])
    const error = e1?.message || e2?.message || e3?.message || e4?.message || e5?.message || null
    if (error) return { summary: { assigned: 0, resolved: 0, reassigned: 0, expenseTotal: 0, present: 0, leave: 0 }, error }

    const summary: EngineerAnalyticsSummary = {
      assigned: assignedRows?.length || 0,
      resolved: resolvedRows?.length || 0,
      reassigned: reassignedRows?.length || 0,
      expenseTotal: (expenseRows || []).reduce((sum, r) => sum + Number(r.amount), 0),
      present: (attendanceRows || []).filter(r => r.status === 'present').length,
      leave: (attendanceRows || []).filter(r => r.status === 'leave').length,
    }
    return { summary, error: null }
  } catch (e: unknown) {
    return { summary: { assigned: 0, resolved: 0, reassigned: 0, expenseTotal: 0, present: 0, leave: 0 }, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getEngineerAnalyticsDrilldownCore(admin: AdminClient, engineerId: string, month: string, metric: AnalyticsMetric): Promise<{ rows: AnalyticsDrilldownRow[]; error: string | null }> {
  try {
    const { startDate, endDateExclusive } = monthRange(month)
    const startTs = `${startDate}T00:00:00.000Z`
    const endTs = `${endDateExclusive}T00:00:00.000Z`

    async function withCustomerNames(wos: { id: string; wo_number: string; status: string; scheduled_date: string | null; customer_id: string }[]): Promise<AnalyticsDrilldownRow[]> {
      const customerIds = [...new Set(wos.map(w => w.customer_id))]
      const { data: customers } = customerIds.length ? await admin.from('customers').select('id, name').in('id', customerIds) : { data: [] }
      const nameById = new Map((customers || []).map(c => [c.id, c.name]))
      return wos.map(w => ({ id: w.id, woNumber: w.wo_number, customerName: nameById.get(w.customer_id) || null, status: w.status, date: w.scheduled_date, amount: null }))
    }

    if (metric === 'assigned') {
      const { data, error } = await admin.from('work_orders').select('id, wo_number, status, scheduled_date, customer_id').eq('engineer_id', engineerId).gte('scheduled_date', startDate).lt('scheduled_date', endDateExclusive).order('scheduled_date')
      if (error) return { rows: [], error: error.message }
      return { rows: await withCustomerNames(data || []), error: null }
    }

    if (metric === 'resolved') {
      const { data, error } = await admin.from('work_orders').select('id, wo_number, status, scheduled_date, customer_id').eq('engineer_id', engineerId).eq('status', 'completed').gte('updated_at', startTs).lt('updated_at', endTs).order('scheduled_date')
      if (error) return { rows: [], error: error.message }
      return { rows: await withCustomerNames(data || []), error: null }
    }

    if (metric === 'reassigned') {
      const { data: closures, error } = await admin.from('work_order_daily_closures').select('id, work_order_id, created_at').eq('engineer_id', engineerId).eq('needs_reassignment', true).gte('created_at', startTs).lt('created_at', endTs).order('created_at')
      if (error) return { rows: [], error: error.message }
      const woIds = [...new Set((closures || []).map(c => c.work_order_id))]
      const { data: wos } = woIds.length ? await admin.from('work_orders').select('id, wo_number, status, customer_id').in('id', woIds) : { data: [] }
      const woById = new Map((wos || []).map(w => [w.id, w]))
      const customerIds = [...new Set((wos || []).map(w => w.customer_id))]
      const { data: customers } = customerIds.length ? await admin.from('customers').select('id, name').in('id', customerIds) : { data: [] }
      const nameById = new Map((customers || []).map(c => [c.id, c.name]))
      return {
        rows: (closures || []).map(c => {
          const wo = woById.get(c.work_order_id)
          return { id: c.id, woNumber: wo?.wo_number || null, customerName: wo ? nameById.get(wo.customer_id) || null : null, status: wo?.status || null, date: c.created_at, amount: null }
        }),
        error: null,
      }
    }

    if (metric === 'expenses') {
      const { data: logs, error } = await admin.from('expense_logs').select('id, expense_date, amount, status, work_order_id').eq('engineer_id', engineerId).gte('expense_date', startDate).lt('expense_date', endDateExclusive).order('expense_date')
      if (error) return { rows: [], error: error.message }
      const woIds = [...new Set((logs || []).map(l => l.work_order_id))]
      const { data: wos } = woIds.length ? await admin.from('work_orders').select('id, wo_number').in('id', woIds) : { data: [] }
      const woById = new Map((wos || []).map(w => [w.id, w.wo_number]))
      return { rows: (logs || []).map(l => ({ id: l.id, woNumber: woById.get(l.work_order_id) || null, customerName: null, status: l.status, date: l.expense_date, amount: Number(l.amount) })), error: null }
    }

    // present / leave
    const { data, error } = await admin.from('attendance').select('id, attendance_date, status').eq('engineer_id', engineerId).eq('status', metric === 'present' ? 'present' : 'leave').gte('attendance_date', startDate).lt('attendance_date', endDateExclusive).order('attendance_date')
    if (error) return { rows: [], error: error.message }
    return { rows: (data || []).map(a => ({ id: a.id, woNumber: null, customerName: null, status: a.status, date: a.attendance_date, amount: null })), error: null }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  }
}
