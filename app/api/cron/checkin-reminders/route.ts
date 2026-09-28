export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/db/admin-client'
import { notifyUsers } from '@/lib/notifications'

// This runs once a day, just after 11:00 AM IST (see infra/lib/cron-stack.ts —
// the EventBridge rule fires at 05:30 UTC). It nudges any engineer who has a job
// scheduled for today that they still haven't checked in to, so they either check
// in, mark themselves On the Way, or reschedule it — all three live on the job
// detail screen the notification links to.

// IST calendar date (YYYY-MM-DD). The DB stores scheduled_date as a plain date, so
// "today" must be resolved in IST rather than the container's UTC clock.
function istDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Start of the IST day, expressed as a UTC instant — for comparing against the
// timestamptz check-in column.
function istDayStartIso(istDate: string): string {
  return new Date(`${istDate}T00:00:00+05:30`).toISOString()
}

// One reminder per work order per calendar day — never double-send if the cron is
// invoked more than once on the same day.
async function alreadyNotifiedToday(admin: ReturnType<typeof adminClient>, entityId: string): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
    .eq('type', 'work_order_checkin_reminder').eq('entity_id', entityId).gte('created_at', startOfDay.toISOString())
  return (count || 0) > 0
}

type WoRow = { id: string; wo_number: string; engineer_id: string | null; customer_id: string | null }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const today = istDateStr()

  // Jobs scheduled for today, still open, and assigned to an engineer.
  const { data: rows } = await admin.from('work_orders')
    .select('id, wo_number, engineer_id, customer_id')
    .eq('scheduled_date', today)
    .in('status', ['assigned', 'in_progress'])
    .not('engineer_id', 'is', null)
  const candidates = (rows || []) as WoRow[]

  // Which of those already have a check-in today (by the assigned engineer)? Those
  // are dropped — the engineer is already on the job.
  const dayStart = istDayStartIso(today)
  const woIds = candidates.map(w => w.id)
  const checkedInWoIds = new Set<string>()
  if (woIds.length) {
    const { data: checkins } = await admin.from('work_order_checkins')
      .select('work_order_id').in('work_order_id', woIds).gte('checked_in_at', dayStart)
    ;(checkins || []).forEach(c => { if (c.work_order_id) checkedInWoIds.add(c.work_order_id) })
  }

  const pending = candidates.filter(w => w.engineer_id && !checkedInWoIds.has(w.id))

  const customerIds = [...new Set(pending.map(w => w.customer_id).filter(Boolean))] as string[]
  const { data: customers } = customerIds.length
    ? await admin.from('customers').select('id, name').in('id', customerIds)
    : { data: [] as { id: string; name: string }[] }
  const custMap: Record<string, string> = {}
  ;(customers || []).forEach(c => { custMap[c.id] = c.name })

  let sent = 0
  for (const wo of pending) {
    if (!wo.engineer_id) continue
    if (await alreadyNotifiedToday(admin, wo.id)) continue
    const who = (wo.customer_id && custMap[wo.customer_id]) || 'a job'
    await notifyUsers(admin, [{ userId: wo.engineer_id }], {
      type: 'work_order_checkin_reminder',
      title: `Not checked in yet: ${wo.wo_number}`,
      body: `${who} is scheduled for today and you haven't checked in. Check in, mark yourself On the Way, or reschedule it.`,
      entityType: 'work_order', entityId: wo.id, linkPath: `/mobile/work-orders/${wo.id}`,
    })
    sent++
  }

  return NextResponse.json({ ok: true, sent, checked: candidates.length, alreadyCheckedIn: checkedInWoIds.size })
}
