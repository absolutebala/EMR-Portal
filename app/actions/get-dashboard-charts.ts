'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getMyDepartmentScope } from './departments'
import { getISTDateStr } from '@/lib/mobile/core/attendance'
import { classifyWarranty } from '@/lib/warranty'
import { JOB_TYPE_LABELS } from '@/components/mobile/constants'
import type { ChartWindow, DashboardChartsData, SeriesItem } from '@/lib/dashboardCharts'

const NO_DEPT = 'no-department'
const JOB_ORDER = Object.keys(JOB_TYPE_LABELS)
const MAX_WEEKS = 53 // guard against an enormous custom range

// ── IST date/bucket helpers (operate on YYYY-MM-DD strings, which sort chronologically) ──
// Weeks are Sunday-start to match the Reports/Attendance period selector (getRange).
function weekStartOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10)
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1
}
function labelOf(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}
function weekRangeOf(start: string): string {
  return `${labelOf(start)} – ${labelOf(addDays(start, 6))}`
}
function dayRangeOf(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
}
function bucketIdx(starts: string[], iso: string, span: number): number {
  for (let i = 0; i < starts.length; i++) if (iso >= starts[i] && iso <= addDays(starts[i], span - 1)) return i
  return -1
}

function one<T>(v: T | T[] | null | undefined): T | undefined { return Array.isArray(v) ? v[0] : (v ?? undefined) }

type WoRow = { created_at: string; job_type: string; department_id: string | null }
type TsEmbedRow = { department_id: string | null }
type WarrEmbed = { warranty_status: string | null; dispatch_date: string | null; warranty_years: number | null }

export async function getDashboardCharts(range?: { from: string; to: string }): Promise<DashboardChartsData> {
  const emptyWin: ChartWindow = { labels: [], ranges: [], ccc: { created: [], completed: [], closed: [] }, pt: { total: [], paid: [] }, job: [], dept: [], spare: { requested: [], approved: [], dispatched: [] } }
  const emptyData: DashboardChartsData = {
    status: { unassigned: 0, assigned: 0, in_progress: 0, needs_reassignment: 0, completed: 0, closed: 0 },
    warranty: { underWarranty: 0, expiring: 0, noWarranty: 0 },
    window: emptyWin,
  }
  try {
    const admin = adminClient()
    const departmentScope = await getMyDepartmentScope()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopeWo = (q: any): any => (departmentScope ? q.or(`department_id.in.(${departmentScope.join(',')}),department_id.is.null`) : q)
    const inScope = (dept: string | null | undefined) => !departmentScope || dept == null || departmentScope.includes(dept)

    // ── Resolve the selected range. Default: this IST month. A short range (≤ 8 days, e.g.
    // "This Week") is shown day-by-day; anything longer is bucketed into Sun–Sat weeks. ──
    const todayIso = getISTDateStr()
    const from = range?.from || (todayIso.slice(0, 8) + '01')
    const to = range?.to || (() => { const d = new Date(todayIso + 'T00:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) })()
    const daily = daysInclusive(from, to) >= 1 && daysInclusive(from, to) <= 8
    const span = daily ? 1 : 7
    const buckets: string[] = []
    if (daily) {
      for (let d = from; d <= to && buckets.length < 31; d = addDays(d, 1)) buckets.push(d)
    } else {
      for (let m = weekStartOf(from); m <= to && buckets.length < MAX_WEEKS; m = addDays(m, 7)) buckets.push(m)
    }
    if (!buckets.length) buckets.push(daily ? from : weekStartOf(from))
    const fetchFrom = buckets[0]
    const fetchTo = addDays(buckets[buckets.length - 1], span) // exclusive upper bound

    const nowMs = Date.now()
    const STATUSES = ['unassigned', 'assigned', 'in_progress', 'needs_reassignment', 'completed', 'closed'] as const

    const [
      statusCounts,
      { data: openWarrRows },
      { data: woRows }, { data: completedRows }, { data: closedRows },
      { data: spareItemRows }, { data: deptRows },
    ] = await Promise.all([
      Promise.all(STATUSES.map(async s => {
        const { count } = await scopeWo(admin.from('work_orders').select('id', { count: 'exact', head: true }).eq('status', s))
        return count || 0
      })),
      scopeWo(admin.from('work_orders').select('department_id, work_order_transformers(transformers(warranty_status, dispatch_date, warranty_years))').not('status', 'in', '(completed,closed)')),
      scopeWo(admin.from('work_orders').select('created_at, job_type, department_id').gte('created_at', fetchFrom).lt('created_at', fetchTo)),
      admin.from('work_order_daily_closures').select('created_at, work_orders(department_id)').eq('outcome', 'completed').gte('created_at', fetchFrom).lt('created_at', fetchTo),
      admin.from('work_order_activity').select('created_at, work_orders(department_id)').eq('action', 'Status updated to Closed').gte('created_at', fetchFrom).lt('created_at', fetchTo),
      // Spare funnel — items keyed on the PARENT REQUEST's week, counting how far each
      // has progressed (requested ⊇ approved ⊇ dispatched) so counts are consistent.
      admin.from('product_request_items').select('approved_at, dispatched_at, product_requests!inner(created_at, work_orders(department_id))').gte('product_requests.created_at', fetchFrom).lt('product_requests.created_at', fetchTo),
      admin.from('departments').select('id, name').order('sort_order').order('name'),
    ])

    const status = Object.fromEntries(STATUSES.map((s, i) => [s, statusCounts[i]])) as DashboardChartsData['status']

    // ── Warranty snapshot: best warranty state among each open notification's transformers. ──
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

    const wo = (woRows as WoRow[] | null) || []
    const completed = ((completedRows as unknown as { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[]) || [])
      .filter(r => inScope(one(r.work_orders)?.department_id))
    const closed = ((closedRows as unknown as { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[]) || [])
      .filter(r => inScope(one(r.work_orders)?.department_id))
    const spareItems = ((spareItemRows as unknown as { approved_at: string | null; dispatched_at: string | null; product_requests: { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null } | { created_at: string; work_orders: TsEmbedRow | TsEmbedRow[] | null }[] | null }[]) || [])
      .map(r => { const pr = one(r.product_requests); return { approved_at: r.approved_at, dispatched_at: r.dispatched_at, reqCreated: pr?.created_at, dept: one(pr?.work_orders)?.department_id } })
      .filter(r => r.reqCreated && inScope(r.dept))

    const depts = (deptRows as { id: string; name: string }[] | null) || []
    const deptName: Record<string, string> = { [NO_DEPT]: 'No Department' }
    depts.forEach(d => { deptName[d.id] = d.name })
    const deptOrder = [...depts.map(d => d.id), NO_DEPT]
    const istDay = (ts: string) => getISTDateStr(new Date(ts))

    const N = buckets.length
    const z = () => Array(N).fill(0) as number[]
    const ccc = { created: z(), completed: z(), closed: z() }
    const pt = { total: z(), paid: z() }
    const spare = { requested: z(), approved: z(), dispatched: z() }
    const jobAgg: Record<string, number[]> = {}
    const deptAgg: Record<string, number[]> = {}
    const bi = (ts: string) => bucketIdx(buckets, istDay(ts), span)

    for (const r of wo) {
      const i = bi(r.created_at); if (i < 0) continue
      ccc.created[i]++; pt.total[i]++; if (r.job_type === 'overhauling') pt.paid[i]++
      ;(jobAgg[r.job_type] || (jobAgg[r.job_type] = z()))[i]++
      const dk = r.department_id || NO_DEPT
      ;(deptAgg[dk] || (deptAgg[dk] = z()))[i]++
    }
    for (const r of completed) { const i = bi(r.created_at); if (i >= 0) ccc.completed[i]++ }
    for (const r of closed) { const i = bi(r.created_at); if (i >= 0) ccc.closed[i]++ }
    for (const r of spareItems) {
      const i = bi(r.reqCreated!); if (i < 0) continue
      spare.requested[i]++
      if (r.approved_at) spare.approved[i]++
      if (r.dispatched_at) spare.dispatched[i]++
    }

    const job: SeriesItem[] = JOB_ORDER.filter(jt => jobAgg[jt]?.some(v => v > 0)).map(jt => ({ label: JOB_TYPE_LABELS[jt] || jt, data: jobAgg[jt] }))
    const dept: SeriesItem[] = deptOrder.filter(k => deptAgg[k]?.some(v => v > 0)).map(k => ({ label: deptName[k] || k, data: deptAgg[k] }))
    const window: ChartWindow = { labels: buckets.map(labelOf), ranges: buckets.map(daily ? dayRangeOf : weekRangeOf), ccc, pt, job, dept, spare }

    return { status, warranty, window }
  } catch (e) {
    console.error('getDashboardCharts failed:', e)
    return emptyData
  }
}
