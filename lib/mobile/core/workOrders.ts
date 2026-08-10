import {
  type AdminClient, type MobileWorkOrderWithCustomer, type MobileWorkOrderDetail,
  touchHeartbeat, fetchSingleWorkOrder,
} from './shared'

// For screens (check-in, closure) that only need the work order + customer info,
// not the full hub detail (checkin history, closures, previous visits) — no reason
// to pay for those extra queries on a page that never renders them.
export async function getMobileWorkOrderBasicCore(admin: AdminClient, userId: string, woId: string): Promise<{ workOrder: MobileWorkOrderWithCustomer | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { workOrder: null, error: 'Notification not found' }
    return { workOrder, error: null }
  } catch (e: unknown) {
    return { workOrder: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMobileWorkOrderDetailCore(admin: AdminClient, userId: string, woId: string): Promise<{ detail: MobileWorkOrderDetail | null; error: string | null }> {
  try {
    touchHeartbeat(admin, userId)
    const workOrder = await fetchSingleWorkOrder(admin, woId)
    if (!workOrder) return { detail: null, error: 'Notification not found' }

    const [{ data: checkins }, { data: submission }, { data: closures }, { data: currentWotRows }] = await Promise.all([
      admin.from('work_order_checkins').select('checked_in_at').eq('work_order_id', woId).order('checked_in_at', { ascending: false }).limit(1),
      admin.from('form_submissions').select('id').eq('work_order_id', woId).limit(1),
      admin.from('work_order_daily_closures')
        .select('outcome, created_at, revisit_date, needs_reassignment, summary, pending_reason, materials_required, engineer_id')
        .eq('work_order_id', woId)
        .order('created_at', { ascending: false })
        .limit(1),
      admin.from('work_order_transformers').select('transformer_id').eq('work_order_id', woId),
    ])

    // "Previous visits" is history for the same equipment (serial number), not the
    // customer as a whole.
    const transformerIds = [...new Set((currentWotRows || []).map(r => r.transformer_id))]
    let previous: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[] = []
    if (transformerIds.length) {
      const { data: relatedWotRows } = await admin
        .from('work_order_transformers')
        .select('work_order_id')
        .in('transformer_id', transformerIds)
        .neq('work_order_id', woId)
      const relatedWoIds = [...new Set((relatedWotRows || []).map(r => r.work_order_id))]
      if (relatedWoIds.length) {
        const { data: relatedWos } = await admin
          .from('work_orders')
          .select('wo_number, job_type, scheduled_date, status')
          .in('id', relatedWoIds)
          .order('scheduled_date', { ascending: false })
          .limit(5)
        previous = relatedWos || []
      }
    }

    const lastCheckinAt = checkins?.[0]?.checked_in_at || null
    const closureRow = closures?.[0] || null

    let engineerName = 'Engineer'
    if (closureRow?.engineer_id) {
      const { data: closureEngineer } = await admin.from('profiles').select('first_name, last_name').eq('id', closureRow.engineer_id).maybeSingle()
      if (closureEngineer) engineerName = `${closureEngineer.first_name} ${closureEngineer.last_name}`
    }

    const latestClosure = closureRow ? {
      outcome: closureRow.outcome,
      created_at: closureRow.created_at,
      revisitDate: closureRow.revisit_date,
      needsReassignment: closureRow.needs_reassignment,
      engineerId: closureRow.engineer_id,
      engineerName,
      summary: closureRow.summary,
      pendingReason: closureRow.pending_reason,
      materialsRequired: closureRow.materials_required,
    } : null

    const checkedInToday = !!lastCheckinAt && new Date(lastCheckinAt).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
    const hasCheckedIn = checkedInToday && (!latestClosure || new Date(lastCheckinAt!) > new Date(latestClosure.created_at))

    return {
      detail: {
        workOrder,
        hasCheckedIn,
        lastCheckinAt,
        hasFormSubmission: !!submission?.length,
        latestClosure,
        handoverFromOtherEngineer: !!(latestClosure?.engineerId && latestClosure.engineerId !== userId),
        previousVisits: previous || [],
      },
      error: null,
    }
  } catch (e: unknown) {
    return { detail: null, error: e instanceof Error ? e.message : String(e) }
  }
}
