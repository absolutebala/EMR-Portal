import { logActivity as logSystemActivity } from '@/lib/activity-log'
import { sendWhatsApp } from '@/lib/messaging/whatsapp'
import {
  type AdminClient, type MobileWorkOrder, type MobileDashboardStats, type OverdueFollowUp,
  type EngineerStatusValue, type AssignableSite, type EngineerStatusPrompt, type NotStartedNotice, type CheckinDriftNotice,
  withTimeout, touchHeartbeat, haversineKm, fetchEngineerWorkOrders, getEngineerName, reverseGeocodeCore,
  logActivity, WORK_ORDER_SELECT,
} from './shared'
import { getPendingProductItemsCore, type PendingProductItem } from './products'
import { getMyAttendanceStatusCore, getISTDateStr, markAttendanceCore, type AttendanceEffectiveStatus } from './attendance'

// Sentinel used in place of a real department UUID for engineers with no
// department assigned — matches the client-facing '/mobile/department-jobs?dept='
// query param, since a real department is always a UUID.
export const UNASSIGNED_DEPARTMENT_ID = 'unassigned'

export interface DepartmentOpenCount {
  departmentId: string
  department: string
  count: number
}

export interface DepartmentOpenJob {
  id: string
  woNumber: string
  customerName: string
  siteName: string | null
  serialNumbers: string[]
  status: string
  scheduledDate: string | null
  engineerName: string
}

type WorkOrderWithDept = {
  id: string; wo_number: string; status: string; scheduled_date: string | null; department_id: string | null
  customers: { name: string } | null
  work_order_transformers: { transformers: { serial_number: string; customer_sites: { site_name: string } | null } | null }[]
  profiles: { first_name: string; last_name: string } | null
}

// Per-engineer (primary assignment + additional-engineer assignments, same union
// fetchEngineerWorkOrders uses for the Jobs list) — this engineer's own open
// notification load per department, tallied client-side over a small flat query.
// Department is read straight off work_orders.department_id (set by whoever created
// the notification), not derived from the assigned engineer.
export async function getDepartmentOpenCountsCore(admin: AdminClient, engineerId: string): Promise<{ counts: DepartmentOpenCount[]; error: string | null }> {
  try {
    const [{ data: departments, error: deptError }, { data: primaryRows, error: primaryError }, { data: additionalAssignments }] = await Promise.all([
      admin.from('departments').select('id, name').order('sort_order').order('name'),
      admin.from('work_orders').select('id, department_id').eq('engineer_id', engineerId).neq('status', 'completed'),
      admin.from('work_order_engineer_assignments').select('work_order_id').eq('engineer_id', engineerId),
    ])
    if (deptError) return { counts: [], error: deptError.message }
    if (primaryError) return { counts: [], error: primaryError.message }

    type Row = { id: string; department_id: string | null }
    const primary = (primaryRows as unknown as Row[]) || []
    const additionalWoIds = [...new Set((additionalAssignments || []).map(a => a.work_order_id))]
      .filter(id => !primary.some(w => w.id === id))
    let additional: Row[] = []
    if (additionalWoIds.length) {
      const { data: extraRows, error: extraError } = await admin.from('work_orders').select('id, department_id').in('id', additionalWoIds).neq('status', 'completed')
      if (extraError) return { counts: [], error: extraError.message }
      additional = (extraRows as unknown as Row[]) || []
    }
    const rows = [...primary, ...additional]

    const tally: Record<string, number> = {}
    for (const d of departments || []) tally[d.id] = 0
    let unassigned = 0
    for (const r of rows) {
      const deptId = r.department_id
      if (deptId && deptId in tally) tally[deptId]++
      else unassigned++
    }
    const counts: DepartmentOpenCount[] = (departments || []).map(d => ({ departmentId: d.id, department: d.name, count: tally[d.id] }))
    // "No Department", not "Unassigned" — every job counted here is already scoped to
    // this engineer (primary or additional assignment); a null department_id just
    // means nobody tagged a department on the notification, not that it lacks an
    // engineer. "Unassigned" read as if the job itself were unclaimed.
    if (unassigned > 0) counts.push({ departmentId: UNASSIGNED_DEPARTMENT_ID, department: 'No Department', count: unassigned })
    return { counts, error: null }
  } catch (e: unknown) {
    return { counts: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Per-engineer tap-through list for a department card — same primary + additional-
// assignment union as getDepartmentOpenCountsCore above. Deliberately doesn't reuse
// fetchEngineerWorkOrders/MobileWorkOrder (which carry per-viewer fields like
// distanceKm this list doesn't need) — engineerName stays useful since an
// additional-assignment job's primary engineer can be someone else.
export async function getDepartmentOpenJobsCore(admin: AdminClient, engineerId: string, departmentId: string): Promise<{ jobs: DepartmentOpenJob[]; error: string | null }> {
  try {
    const SELECT = `${WORK_ORDER_SELECT}, department_id, profiles!work_orders_engineer_id_fkey(first_name, last_name)`

    let primaryQuery = admin.from('work_orders').select(SELECT).eq('engineer_id', engineerId).neq('status', 'completed')
    primaryQuery = departmentId === UNASSIGNED_DEPARTMENT_ID ? primaryQuery.is('department_id', null) : primaryQuery.eq('department_id', departmentId)
    const { data: primaryData, error: primaryError } = await primaryQuery.order('scheduled_date', { ascending: true })
    if (primaryError) return { jobs: [], error: primaryError.message }

    const primaryRows = (primaryData as unknown as WorkOrderWithDept[]) || []
    const { data: additionalAssignments } = await admin.from('work_order_engineer_assignments').select('work_order_id').eq('engineer_id', engineerId)
    const additionalWoIds = [...new Set((additionalAssignments || []).map(a => a.work_order_id))]
      .filter(id => !primaryRows.some(w => w.id === id))

    let additionalRows: WorkOrderWithDept[] = []
    if (additionalWoIds.length) {
      let additionalQuery = admin.from('work_orders').select(SELECT).in('id', additionalWoIds).neq('status', 'completed')
      additionalQuery = departmentId === UNASSIGNED_DEPARTMENT_ID ? additionalQuery.is('department_id', null) : additionalQuery.eq('department_id', departmentId)
      const { data: extraData, error: extraError } = await additionalQuery.order('scheduled_date', { ascending: true })
      if (extraError) return { jobs: [], error: extraError.message }
      additionalRows = (extraData as unknown as WorkOrderWithDept[]) || []
    }

    const rows = [...primaryRows, ...additionalRows]

    const jobs: DepartmentOpenJob[] = rows.map(r => {
      const txRows = r.work_order_transformers || []
      return {
        id: r.id,
        woNumber: r.wo_number,
        customerName: r.customers?.name || '',
        siteName: txRows[0]?.transformers?.customer_sites?.site_name || null,
        serialNumbers: txRows.map(t => t.transformers?.serial_number).filter(Boolean) as string[],
        status: r.status,
        scheduledDate: r.scheduled_date,
        engineerName: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'Unassigned',
      }
    })
    return { jobs, error: null }
  } catch (e: unknown) {
    return { jobs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileWorkOrdersCore(admin: AdminClient, userId: string): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string; avatarUrl: string | null } | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, userId),
      fetchEngineerWorkOrders(admin, userId),
    ])
    return { workOrders: workOrders.filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment'), engineer, error: null }
  } catch (e: unknown) {
    return { workOrders: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface EngineerStreak {
  count: number
  // Oldest -> newest (today last), always length 5 — matches the mobile dashboard's
  // 5-day dot row 1:1.
  days: boolean[]
}

const STREAK_WINDOW_DAYS = 5

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// A day counts as "clean" if the engineer closed out at least one job that day and
// none of that day's closures needed reassignment — days with zero closures (a
// rostered day off, or simply mid-job with nothing closed yet) are neither clean nor
// dirty, they're just skipped when walking the streak backward from today. This is a
// deliberately simple proxy for "days going well" built entirely from data already
// recorded by the daily-closure flow — not a true schedule-adherence/SLA calculation,
// which this app has no clean data source for.
export async function getEngineerStreakCore(admin: AdminClient, userId: string): Promise<{ streak: EngineerStreak; error: string | null }> {
  try {
    const today = startOfDayUTC(new Date())
    const windowStart = new Date(today.getTime() - (STREAK_WINDOW_DAYS - 1) * 86400000)

    const { data: rows, error } = await admin
      .from('work_order_daily_closures')
      .select('created_at, needs_reassignment')
      .eq('engineer_id', userId)
      .gte('created_at', windowStart.toISOString())
    if (error) return { streak: { count: 0, days: Array(STREAK_WINDOW_DAYS).fill(false) }, error: error.message }

    // index 0 = today, ..., index 4 = 4 days ago
    const dirty = Array(STREAK_WINDOW_DAYS).fill(false)
    const hasAny = Array(STREAK_WINDOW_DAYS).fill(false)
    for (const r of rows || []) {
      const dayIndex = Math.floor((today.getTime() - startOfDayUTC(new Date(r.created_at)).getTime()) / 86400000)
      if (dayIndex < 0 || dayIndex >= STREAK_WINDOW_DAYS) continue
      hasAny[dayIndex] = true
      if (r.needs_reassignment) dirty[dayIndex] = true
    }

    let count = 0
    for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
      if (!hasAny[i]) continue // no closures that day — skip, doesn't break the streak
      if (dirty[i]) break
      count++
    }

    const days = Array.from({ length: STREAK_WINDOW_DAYS }, (_, i) => {
      const dayIndex = STREAK_WINDOW_DAYS - 1 - i // reverse to oldest -> newest
      return hasAny[dayIndex] && !dirty[dayIndex]
    })

    return { streak: { count, days }, error: null }
  } catch (e: unknown) {
    return { streak: { count: 0, days: Array(STREAK_WINDOW_DAYS).fill(false) }, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileDashboardDataCore(admin: AdminClient, userId: string): Promise<{
  stats: MobileDashboardStats
  recentJobs: MobileWorkOrder[]
  engineer: { name: string; avatarUrl: string | null } | null
  streak: EngineerStreak
  pendingProducts: PendingProductItem[]
  attendanceStatus: AttendanceEffectiveStatus
  error: string | null
}> {
  try {
    touchHeartbeat(admin, userId)
    const [engineer, workOrders, { streak }, { items: pendingProducts }, { status: attendanceStatus }] = await Promise.all([
      getEngineerName(admin, userId),
      fetchEngineerWorkOrders(admin, userId),
      getEngineerStreakCore(admin, userId),
      getPendingProductItemsCore(admin, userId),
      getMyAttendanceStatusCore(admin, userId),
    ])

    // "Pending" is no longer a distinct status — a visit that couldn't be finished in
    // a day stays In Progress with a follow-up date, so it's already counted there.
    const stats: MobileDashboardStats = {
      assigned: workOrders.filter(w => w.status === 'assigned' || w.status === 'unassigned').length,
      inProgress: workOrders.filter(w => w.status === 'in_progress').length,
      needsReassignment: workOrders.filter(w => w.status === 'needs_reassignment').length,
      completed: workOrders.filter(w => w.status === 'completed').length,
    }

    const recentJobs = workOrders.filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment').slice(0, 3)

    return { stats, recentJobs, engineer, streak, pendingProducts, attendanceStatus, error: null }
  } catch (e: unknown) {
    return {
      stats: { assigned: 0, inProgress: 0, needsReassignment: 0, completed: 0 }, recentJobs: [], engineer: null,
      streak: { count: 0, days: Array(STREAK_WINDOW_DAYS).fill(false) }, pendingProducts: [],
      attendanceStatus: { kind: 'pending' }, error: e instanceof Error ? e.message : String(e),
    }
  }
}

// Two situations surfaced as a prompt on dashboard load so a job doesn't just sit
// there unresolved: (1) Pending jobs whose most recent closure's revisit_date has
// already passed, and (2) In-progress jobs checked into on a previous day and never
// closed out.
export async function getOverdueFollowUpsCore(admin: AdminClient, userId: string): Promise<{ followUps: OverdueFollowUp[]; error: string | null }> {
  try {
    const workOrders = await fetchEngineerWorkOrders(admin, userId)
    const pending = workOrders.filter(w => w.status === 'pending')
    const inProgress = workOrders.filter(w => w.status === 'in_progress')
    if (!pending.length && !inProgress.length) return { followUps: [], error: null }

    const todayStr = new Date().toLocaleDateString('en-CA')
    const followUps: OverdueFollowUp[] = []

    if (pending.length) {
      const woIds = pending.map(w => w.id)
      const { data: closures } = await admin
        .from('work_order_daily_closures')
        .select('work_order_id, revisit_date, created_at')
        .in('work_order_id', woIds)
        .order('created_at', { ascending: false })

      const latestRevisitByWo: Record<string, string | null> = {}
      for (const c of closures || []) {
        if (!(c.work_order_id in latestRevisitByWo)) latestRevisitByWo[c.work_order_id] = c.revisit_date
      }

      for (const w of pending) {
        const rd = latestRevisitByWo[w.id]
        if (rd && rd < todayStr) followUps.push({ workOrderId: w.id, woNumber: w.wo_number, customerName: w.customer_name, dueDate: rd, kind: 'pending' })
      }
    }

    if (inProgress.length) {
      const woIds = inProgress.map(w => w.id)
      const { data: checkins } = await admin
        .from('work_order_checkins')
        .select('work_order_id, checked_in_at')
        .in('work_order_id', woIds)
        .order('checked_in_at', { ascending: false })

      const latestCheckinByWo: Record<string, string> = {}
      for (const c of checkins || []) {
        if (!(c.work_order_id in latestCheckinByWo)) latestCheckinByWo[c.work_order_id] = c.checked_in_at
      }

      for (const w of inProgress) {
        const lastCheckin = latestCheckinByWo[w.id]
        if (!lastCheckin) continue
        const lastCheckinDateStr = new Date(lastCheckin).toLocaleDateString('en-CA')
        if (lastCheckinDateStr >= todayStr) continue

        const dueDateStr = w.scheduled_date || lastCheckinDateStr
        if (dueDateStr < todayStr) {
          followUps.push({ workOrderId: w.id, woNumber: w.wo_number, customerName: w.customer_name, dueDate: dueDateStr, kind: 'stale_in_progress' })
        }
      }
    }

    return { followUps, error: null }
  } catch (e: unknown) {
    return { followUps: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function rescheduleFollowUpCore(admin: AdminClient, userId: string, workOrderId: string, newDate: string, offSite?: boolean): Promise<{ error: string | null }> {
  try {
    const woResult = await withTimeout(
      admin.from('work_orders').select('wo_number, engineer_id, status').eq('id', workOrderId).single(),
      8000
    )
    const wo = woResult?.data
    if (!wo) return { error: 'Notification not found' }
    if (wo.engineer_id !== userId) return { error: 'Not authorized to reschedule this notification' }
    if (wo.status !== 'pending' && wo.status !== 'in_progress') return { error: 'This notification no longer needs rescheduling' }

    if (wo.status === 'in_progress') {
      const updateResult = await withTimeout(
        admin.from('work_orders').update({ scheduled_date: newDate, updated_at: new Date().toISOString() }).eq('id', workOrderId),
        8000
      )
      if (!updateResult) return { error: 'Saving is taking longer than expected — please try again.' }
      if (updateResult.error) return { error: updateResult.error.message }
    } else {
      const closureResult = await withTimeout(
        admin.from('work_order_daily_closures')
          .select('id')
          .eq('work_order_id', workOrderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        8000
      )
      const latestClosureId = closureResult?.data?.id
      if (!latestClosureId) return { error: 'No closure found to reschedule' }

      const updateResult = await withTimeout(
        admin.from('work_order_daily_closures').update({ revisit_date: newDate }).eq('id', latestClosureId),
        8000
      )
      if (!updateResult) return { error: 'Saving is taking longer than expected — please try again.' }
      if (updateResult.error) return { error: updateResult.error.message }
    }

    admin.from('profiles').update({
      engineer_status: 'available',
      engineer_status_work_order_id: null,
      engineer_status_updated_at: new Date().toISOString(),
    }).eq('id', userId).eq('engineer_status', 'reached').eq('engineer_status_work_order_id', workOrderId)
      .then(() => {}, () => {})

    const formattedDate = new Date(newDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    logActivity(admin, workOrderId, userId, `Rescheduled follow-up to ${formattedDate}`).catch(() => {})

    if (offSite) {
      const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
      const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
      logSystemActivity(admin, {
        actorId: userId, actorName,
        action: `Rescheduled ${wo.wo_number} without being on-site`,
        entityType: 'off_site_status_update', entityId: workOrderId,
      }).catch(() => {})
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileJobsListCore(admin: AdminClient, userId: string): Promise<{ workOrders: MobileWorkOrder[]; engineer: { name: string; avatarUrl: string | null } | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const [engineer, workOrders] = await Promise.all([
      getEngineerName(admin, userId),
      fetchEngineerWorkOrders(admin, userId),
    ])
    return { workOrders, engineer, error: null }
  } catch (e: unknown) {
    return { workOrders: [], engineer: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function recordLastSeenCore(admin: AdminClient, userId: string, lat: number, lng: number): Promise<{ error: string | null }> {
  try {
    const { label } = await reverseGeocodeCore(lat, lng)
    const result = await withTimeout(
      admin.from('profiles').update({
        last_seen_lat: lat,
        last_seen_lng: lng,
        last_seen_place_label: label,
        last_seen_at: new Date().toISOString(),
      }).eq('id', userId),
      8000
    )
    if (!result) console.error('recordLastSeen: update timed out', userId)
    else if (result.error) console.error('recordLastSeen: update failed', userId, result.error.message)
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export function logLocationPingIssueCore(userId: string | null, reason: string): void {
  console.error('mobile geolocation ping failed', { userId, reason })
}

// Same-day complement to getOverdueFollowUpsCore's 'stale_in_progress' case, which only
// fires the day AFTER a check-in — this catches "still checked in, never closed out" on
// the SAME day too, on every app open, regardless of the engineer's current location.
export async function checkOpenVisitFollowUpCore(admin: AdminClient, userId: string): Promise<{ followUp: OverdueFollowUp | null; error: string | null }> {
  try {
    const { data: profile } = await admin.from('profiles').select('engineer_status, engineer_status_work_order_id').eq('id', userId).maybeSingle()
    if (profile?.engineer_status !== 'reached' || !profile.engineer_status_work_order_id) {
      return { followUp: null, error: null }
    }

    const workOrderId = profile.engineer_status_work_order_id
    const { data: wo } = await admin.from('work_orders').select('id, wo_number, status, customer_id').eq('id', workOrderId).maybeSingle()
    if (!wo || wo.status !== 'in_progress') return { followUp: null, error: null }

    const [{ data: checkin }, { data: closure }] = await Promise.all([
      admin.from('work_order_checkins')
        .select('checked_in_at')
        .eq('work_order_id', workOrderId)
        .order('checked_in_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('work_order_daily_closures')
        .select('created_at')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (!checkin) return { followUp: null, error: null }
    if (closure && closure.created_at >= checkin.checked_in_at) return { followUp: null, error: null }

    const { data: customer } = await admin.from('customers').select('name').eq('id', wo.customer_id).maybeSingle()

    return {
      followUp: {
        workOrderId: wo.id,
        woNumber: wo.wo_number,
        customerName: customer?.name || '',
        dueDate: checkin.checked_in_at,
        kind: 'open_checkin',
      },
      error: null,
    }
  } catch (e: unknown) {
    return { followUp: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getEngineerStatusPromptCore(admin: AdminClient, userId: string): Promise<{ prompt: EngineerStatusPrompt | null; error: string | null }> {
  try {
    const [{ data: profile }, workOrders] = await Promise.all([
      admin.from('profiles').select('engineer_status, engineer_status_updated_at').eq('id', userId).maybeSingle(),
      fetchEngineerWorkOrders(admin, userId),
    ])

    const todayStr = new Date().toLocaleDateString('en-CA')
    const updatedToday = !!profile?.engineer_status_updated_at && new Date(profile.engineer_status_updated_at).toLocaleDateString('en-CA') === todayStr

    const assignableSites: AssignableSite[] = workOrders
      .filter(w => w.status !== 'completed' && w.status !== 'needs_reassignment')
      .map(w => ({ workOrderId: w.id, woNumber: w.wo_number, siteName: w.site_name || w.customer_name }))

    return {
      prompt: {
        needsPrompt: !updatedToday,
        currentStatus: (profile?.engineer_status as EngineerStatusValue) || 'available',
        assignableSites,
      },
      error: null,
    }
  } catch (e: unknown) {
    return { prompt: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function setEngineerStatusCore(
  admin: AdminClient,
  userId: string,
  status: EngineerStatusValue,
  workOrderId?: string | null,
  startByTime?: string | null,
  currentLat?: number | null,
  currentLng?: number | null
): Promise<{ error: string | null }> {
  try {
    if ((status === 'on_the_way' || status === 'travelling') && !workOrderId) {
      return { error: 'Pick a project' }
    }
    if ((status === 'on_the_way' || status === 'travelling') && !startByTime) {
      return { error: 'Pick a start time' }
    }

    const isTravelStatus = status === 'on_the_way' || status === 'travelling'
    let startBy: string | null = null
    if (isTravelStatus && startByTime) {
      const todayStr = new Date().toLocaleDateString('en-CA')
      const parsed = new Date(`${todayStr}T${startByTime}:00`)
      startBy = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }

    const { error } = await admin.from('profiles').update({
      engineer_status: status,
      engineer_status_work_order_id: status === 'available' || status === 'on_leave' ? null : (workOrderId || null),
      engineer_status_updated_at: new Date().toISOString(),
      engineer_status_start_by: isTravelStatus ? startBy : null,
      engineer_status_set_lat: isTravelStatus ? (currentLat ?? null) : null,
      engineer_status_set_lng: isTravelStatus ? (currentLng ?? null) : null,
    }).eq('id', userId)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    const STATUS_LABEL: Record<EngineerStatusValue, string> = {
      available: 'Available', on_leave: 'On Leave', on_the_way: 'On the way', travelling: 'Travelling', reached: 'Reached project', completed: 'Completed',
    }
    logSystemActivity(admin, { actorId: userId, actorName, action: `Set status to ${STATUS_LABEL[status]}`, entityType: 'engineer_status', entityId: userId }).catch(() => {})

    // "On Leave" here (profiles.engineer_status) and the Attendance feature's
    // present/leave tracking (the `attendance` table) were previously two
    // disconnected systems that both happened to use the word "leave" — this
    // records a real self-marked Leave row so the Attendance page shows an actual
    // timestamp instead of only the auto-computed 11am-cutoff placeholder. No
    // approval needed: this isn't correcting anything, it's a same-day self-report.
    if (status === 'on_leave') {
      const todayStr = getISTDateStr()
      ;(async () => {
        const { data: existing } = await admin.from('attendance').select('status').eq('engineer_id', userId).eq('attendance_date', todayStr).maybeSingle()
        // Don't clobber an already-marked Present for today — this is a passive
        // convenience write, not an amendment flow.
        if (existing?.status === 'present') return
        await admin.from('attendance').upsert({
          engineer_id: userId,
          attendance_date: todayStr,
          status: 'leave',
          marked_at: new Date().toISOString(),
          latitude: currentLat ?? null,
          longitude: currentLng ?? null,
          place_name: null,
          reason: null,
          approval_status: null,
          approved_by: null,
          approved_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'engineer_id,attendance_date' })
      })().catch(() => {})
    }

    // "Available" marks Present the same way — but through markAttendanceCore
    // itself, not a raw upsert, so the 11am-cutoff/reason/approval safeguard still
    // applies: before cutoff this silently marks Present with a real timestamp,
    // after cutoff it silently no-ops (no reason was collected here), leaving the
    // day as Leave until the engineer goes through the proper amend-with-reason
    // flow. Selecting "Available" can never become a backdoor around approval.
    if (status === 'available') {
      markAttendanceCore(admin, userId, { latitude: currentLat ?? null, longitude: currentLng ?? null, placeName: null }).catch(() => {})
    }

    if (status === 'on_the_way' && workOrderId) {
      const { data: wo } = await admin.from('work_orders').select('wo_number, customer_id').eq('id', workOrderId).maybeSingle()
      if (wo?.customer_id) {
        const { data: customer } = await admin.from('customers').select('contact_person, phone, whatsapp_number').eq('id', wo.customer_id).maybeSingle()
        if (customer) {
          sendWhatsApp(admin, 'on_the_way', [{ phone: customer.whatsapp_number || customer.phone, userName: customer.contact_person }],
            [customer.contact_person, actorName, wo.wo_number || '', startByTime || '']).catch(() => {})
        }
      }
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

const NOT_STARTED_THRESHOLD_KM = 0.3

export async function checkNotStartedFollowUpCore(admin: AdminClient, userId: string, currentLat: number, currentLng: number): Promise<{ notice: NotStartedNotice | null; error: string | null }> {
  try {
    const { data: profile } = await admin.from('profiles')
      .select('engineer_status, engineer_status_work_order_id, engineer_status_start_by, engineer_status_set_lat, engineer_status_set_lng')
      .eq('id', userId).maybeSingle()

    if (profile?.engineer_status !== 'on_the_way' && profile?.engineer_status !== 'travelling') return { notice: null, error: null }
    if (!profile.engineer_status_start_by) return { notice: null, error: null }
    if (new Date(profile.engineer_status_start_by) > new Date()) return { notice: null, error: null }
    if (profile.engineer_status_set_lat == null || profile.engineer_status_set_lng == null) return { notice: null, error: null }

    const distanceKm = haversineKm(profile.engineer_status_set_lat, profile.engineer_status_set_lng, currentLat, currentLng)
    if (distanceKm >= NOT_STARTED_THRESHOLD_KM) return { notice: null, error: null }

    let projectLabel = 'your next job'
    if (profile.engineer_status_work_order_id) {
      const { data: wo } = await admin.from('work_orders').select('customer_id').eq('id', profile.engineer_status_work_order_id).maybeSingle()
      if (wo) {
        const { data: wotRows } = await admin.from('work_order_transformers').select('transformers(customer_sites(site_name))').eq('work_order_id', profile.engineer_status_work_order_id).limit(1)
        type Row = { transformers: { customer_sites: { site_name: string } | null } | null }
        const siteName = ((wotRows as unknown as Row[]) || [])[0]?.transformers?.customer_sites?.site_name
        const { data: customer } = await admin.from('customers').select('name').eq('id', wo.customer_id).maybeSingle()
        projectLabel = siteName || customer?.name || projectLabel
      }
    }

    return { notice: { projectLabel }, error: null }
  } catch (e: unknown) {
    return { notice: null, error: e instanceof Error ? e.message : String(e) }
  }
}

const CHECKIN_DRIFT_THRESHOLD_KM = 2

// Companion to checkNotStartedFollowUpCore above, but the inverse direction: once an
// engineer has actually checked in ('reached'), if their live location later drifts
// away from where they checked in, nudge them to update the notification's status —
// they may have left the site without marking progress. Unlike engineer_status_set_lat
// /lng (only populated for travel statuses, see setEngineerStatusCore), 'reached' has
// no location captured on `profiles` — the check-in coordinate lives on the latest
// work_order_checkins row for the job instead (submitCheckInCore), which is what every
// other "where did they last check in" consumer in this file already reads from.
export async function checkCheckinDriftCore(admin: AdminClient, userId: string, currentLat: number, currentLng: number): Promise<{ notice: CheckinDriftNotice | null; error: string | null }> {
  try {
    const { data: profile } = await admin.from('profiles')
      .select('engineer_status, engineer_status_work_order_id')
      .eq('id', userId).maybeSingle()

    if (profile?.engineer_status !== 'reached') return { notice: null, error: null }
    const workOrderId = profile.engineer_status_work_order_id
    if (!workOrderId) return { notice: null, error: null }

    const { data: checkin } = await admin.from('work_order_checkins')
      .select('latitude, longitude')
      .eq('work_order_id', workOrderId).eq('engineer_id', userId)
      .order('checked_in_at', { ascending: false }).limit(1).maybeSingle()
    if (checkin?.latitude == null || checkin?.longitude == null) return { notice: null, error: null }

    const distanceKm = haversineKm(checkin.latitude, checkin.longitude, currentLat, currentLng)
    if (distanceKm < CHECKIN_DRIFT_THRESHOLD_KM) return { notice: null, error: null }

    let projectLabel = 'the project'
    const { data: wo } = await admin.from('work_orders').select('customer_id').eq('id', workOrderId).maybeSingle()
    if (wo) {
      const { data: wotRows } = await admin.from('work_order_transformers').select('transformers(customer_sites(site_name))').eq('work_order_id', workOrderId).limit(1)
      type Row = { transformers: { customer_sites: { site_name: string } | null } | null }
      const siteName = ((wotRows as unknown as Row[]) || [])[0]?.transformers?.customer_sites?.site_name
      const { data: customer } = await admin.from('customers').select('name').eq('id', wo.customer_id).maybeSingle()
      projectLabel = siteName || customer?.name || projectLabel
    }

    return { notice: { workOrderId, projectLabel, distanceKm }, error: null }
  } catch (e: unknown) {
    return { notice: null, error: e instanceof Error ? e.message : String(e) }
  }
}
