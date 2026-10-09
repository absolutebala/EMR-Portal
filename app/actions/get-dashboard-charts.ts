'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getMyDepartmentScope } from './departments'
import { getISTDateStr } from '@/lib/mobile/core/attendance'
import { classifyWarranty } from '@/lib/warranty'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'
import type { ChartWindow, DashboardChartsData, SeriesItem } from '@/lib/dashboardCharts'

const NO_DEPT = 'no-department'
const JOB_ORDER = Object.keys(JOB_TYPE_LABELS)

// ── IST week helpers (operate on YYYY-MM-DD strings, which sort chronologically) ──
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10)
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
function labelOf(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}
function rangeOf(start: string): string {
  return `${labelOf(start)} – ${labelOf(addDays(start, 6))}`
}
// Index of the week bucket an IST date falls into, or -1.
function bucketIdx(starts: string[], iso: string): number {
  for (let i = 0; i < starts.length; i++) if (iso >= starts[i] && iso <= addDays(starts[i], 6)) return i
  return -1
}

// Normalise a to-one embed that the generated types may widen to an array.
function one<T>(v: T | T[] | null | undefined): T | undefined { return Array.isArray(v) ? v[0] : (v ?? undefined) }

type WoRow = { created_at: string; job_type: string; department_id: string | null }
type TsEmbedRow = { department_id: string | null }
type WarrEmbed = { warranty_status: string | null; dispatch_date: string | null; warranty_years: number | null }

export async function getDashboardCharts(): Promise<DashboardChartsData> {
  const emptyWin: ChartWindow = { labels: [], ranges: [], ccc: { created: [], completed: [], closed: [] }, pt: { total: [], paid: [] }, job: [], dept: [], spare: { requested: [], approved: [], dispatched: [] } }
  const emptyData: DashboardChartsData = {
    status: { unassigned: 0, assigned: 0, in_progress: 0, needs_reassignment: 0, completed: 0, closed: 0 },
    warranty: { underWarranty: 0, expiring: 0, noWarranty: 0 },
    weeks: emptyWin, month: emptyWin,
  }
  try {
    const admin = adminClient()
    const departmentScope = await getMyDepartmentScope()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopeWo = (q: any): any => (departmentScope ? q.or(`department_id.in.(${departmentScope.join(',')}),department_id.is.null`) : q)
    const inScope = (dept: string | null | undefined) => !departmentScope || dept == null || departmentScope.includes(dept)

    // ── Window definitions (last 8 Mon–Sun weeks; current month's weeks) ──
    const todayIso = getISTDateStr()
    const thisMon = mondayOf(todayIso)
    const weekStarts = Array.from({ length: 8 }, (_, i) => addDays(thisMon, -7 * (7 - i)))
    const firstOfMonth = todayIso.slice(0, 8) + '01'
    const lastOfMonth = (() => { const d = new Date(todayIso + 'T00:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) })()
    const monthStarts: string[] = []
    for (let m = mondayOf(firstOfMonth); m <= lastOfMonth; m = addDays(m, 7)) if (addDays(m, 6) >= firstOfMonth) monthStarts.push(m)
    const fetchFrom = addDays(weekStarts[0], -1) // ≤ earliest week start, with a day of IST slack

    const nowMs = Date.now()
    const STATUSES = ['unassigned', 'assigned', 'in_progress', 'needs_reassignment', 'completed', 'closed'] as const

    const [
      statusCounts,
      { data: openWarrRows },
      { data: woRows }, { data: completedRows }, { data: closedRows },
      { data: reqRows }, { data: itemRows }, { data: deptRows },
    ] = await Promise.all([
      // Status snapshot — head counts (no 10k row cap).
      Promise.all(STATUSES.map(async s => {
        const { count } = await scopeWo(admin.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', s))
        return count || 0
      })),
      // Open notifications + their transformers' warranty, for the warranty snapshot.
      scopeWo(admin.from('work_orders').select('department_id, work_order_transformers(transformers(warranty_status, dispatch_date, warranty_years))').not('status', 'in', '(completed,closed)')),
      // Time-series sources, bounded to the 8-week window.
      scopeWo(admin.from('work_orders').select('created_at, job_type, department_id').gte('created_at', fetchFrom)),
      admin.from('work_order_daily_closures').select('created_at, work_orders(department_id)').eq('outcome', 'completed').gte('created_at', fetchFrom),
      admin.from('work_order_activity').select('created_at, work_orders(department_id)').eq('action', 'Status updated to Closed').gte('created_at', fetchFrom),
      admin.from('product_requests').select('created_at, work_orders(department_id)').gte('created_at', fetchFrom),
      admin.from('product_request_items').select('approved_at, dispatched_at, product_requests(work_orders(department_id))').or(`approved_at.gte.${fetchFrom},dispatched_at.gte.${fetchFrom}`),
      admin.from('departments').select('id, name').order('sort_order').order('name'),
    ])

    const status = Object.fromEntries(STATUSES.map((s, i) => [s, statusCounts[i]])) as DashboardChartsData['status']

    // ── Warranty snapshot: classify each open notification by the best warranty state
    // among its transformers (Under > Expiring > No Warranty). WOs with no transformer
    // are skipped — there's nothing to classify. ──
    const warranty = { underWarranty: 0, expiring: 0, noWarranty: 0 }
    type OpenWoRow = { work_order_transformers: { transformers: WarrEmbed | WarrEmbed[] | null }[] | null }
    for (const wo of ((openWarrRows as unknown as OpenWoRow[]) || [])) {
      const txs = (wo.work_order_transformers || []).map(wt => one(wt.transformers)).filter((t): t is WarrEmbed => !!t)
      if (!txs.length) continue
      let best: 'under' | 'expiring' | 'no' = 'no'
      for (const t of txs) {
        const { bucket, expiringSoon } = classifyWarranty(t, nowMs)
        if (bucket === 'under_warranty' && !expiringSoon) { best = 'under'; break }
        if (bucket === 'under_warranty' && expiringSoon) best = 'expiring'
      }
      if (best === 'under') warranty.underWarranty++
      else if (best === 'expiring') warranty.expiring++
      else warranty.noWarranty++
    }

    // Pre-scope + flatten embeds so computeWindow just buckets by date.
    const wo = (woRows as WoRow[] | null) || []
    const completed = ((completedRows as unknown as { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[]) || [])
      .filter(r => inScope(one(r.work_orders)?.department_id))
    const closed = ((closedRows as unknown as { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[]) || [])
      .filter(r => inScope(one(r.work_orders)?.department_id))
    const requested = ((reqRows as unknown as { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[]) || [])
      .filter(r => inScope(one(r.work_orders)?.department_id))
    const items = ((itemRows as unknown as { approved_at: string | null; dispatched_at: string | null; product_requests: { work_orders: TsEmbedRow | TsEmbedRow[] | null } | { work_orders: TsEmbedRow | TsEmbedRow[] | null }[] | null }[]) || [])
      .filter(r => inScope(one(one(r.product_requests)?.work_orders)?.department_id))

    const depts = (deptRows as { id: string; name: string }[] | null) || []
    const deptName: Record<string, string> = { [NO_DEPT]: 'No Department' }
    depts.forEach(d => { deptName[d.id] = d.name })
    const deptOrder = [...depts.map(d => d.id), NO_DEPT]
    const istDay = (ts: string) => getISTDateStr(new Date(ts))

    function computeWindow(starts: string[]): ChartWindow {
      const N = starts.length
      const z = () => Array(N).fill(0) as number[]
      const ccc = { created: z(), completed: z(), closed: z() }
      const pt = { total: z(), paid: z() }
      const spare = { requested: z(), approved: z(), dispatched: z() }
      const jobAgg: Record<string, number[]> = {}
      const deptAgg: Record<string, number[]> = {}
      const bi = (ts: string) => bucketIdx(starts, istDay(ts))

      for (const r of wo) {
        const i = bi(r.created_at); if (i < 0) continue
        ccc.created[i]++; pt.total[i]++; if (r.job_type === 'overhauling') pt.paid[i]++
        ;(jobAgg[r.job_type] || (jobAgg[r.job_type] = z()))[i]++
        const dk = r.department_id || NO_DEPT
        ;(deptAgg[dk] || (deptAgg[dk] = z()))[i]++
      }
      for (const r of completed) { const i = bi(r.created_at); if (i >= 0) ccc.completed[i]++ }
      for (const r of closed) { const i = bi(r.created_at); if (i >= 0) ccc.closed[i]++ }
      for (const r of requested) { const i = bi(r.created_at); if (i >= 0) spare.requested[i]++ }
      for (const r of items) {
        if (r.approved_at) { const i = bi(r.approved_at); if (i >= 0) spare.approved[i]++ }
        if (r.dispatched_at) { const i = bi(r.dispatched_at); if (i >= 0) spare.dispatched[i]++ }
      }

      const job: SeriesItem[] = JOB_ORDER.filter(jt => jobAgg[jt]?.some(v => v > 0)).map(jt => ({ label: JOB_TYPE_LABELS[jt] || jt, data: jobAgg[jt] }))
      const dept: SeriesItem[] = deptOrder.filter(k => deptAgg[k]?.some(v => v > 0)).map(k => ({ label: deptName[k] || k, data: deptAgg[k] }))
      return { labels: starts.map(labelOf), ranges: starts.map(rangeOf), ccc, pt, job, dept, spare }
    }

    return { status, warranty, weeks: computeWindow(weekStarts), month: computeWindow(monthStarts) }
  } catch (e) {
    console.error('getDashboardCharts failed:', e)
    return emptyData
  }
}
