export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/db/admin-client'
import { notifyUsers } from '@/lib/notifications'

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

// One notification per (type, entity) per calendar day — lets "overdue" nag daily
// until resolved while never double-sending if the cron is invoked more than once
// on the same day, and lets "reminder" fire again on a fresh date if a job that was
// rescheduled ends up with a new "tomorrow" later.
async function alreadyNotifiedToday(admin: ReturnType<typeof adminClient>, type: string, entityId: string): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
    .eq('type', type).eq('entity_id', entityId).gte('created_at', startOfDay.toISOString())
  return (count || 0) > 0
}

type WoRow = { id: string; wo_number: string; engineer_id: string | null; customer_id: string }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const today = dateStr(new Date())
  const tomorrow = dateStr(new Date(Date.now() + 24 * 60 * 60 * 1000))

  const [{ data: overdueRows }, { data: reminderRows }] = await Promise.all([
    admin.from('work_orders').select('id, wo_number, engineer_id, customer_id')
      .eq('status', 'in_progress').lt('scheduled_date', today).not('engineer_id', 'is', null),
    admin.from('work_orders').select('id, wo_number, engineer_id, customer_id')
      .in('status', ['assigned', 'in_progress']).eq('scheduled_date', tomorrow).not('engineer_id', 'is', null),
  ])

  const allRows = [...(overdueRows || []), ...(reminderRows || [])] as WoRow[]
  const customerIds = [...new Set(allRows.map(w => w.customer_id))]
  const { data: customers } = customerIds.length
    ? await admin.from('customers').select('id, name').in('id', customerIds)
    : { data: [] as { id: string; name: string }[] }
  const custMap: Record<string, string> = {}
  ;(customers || []).forEach(c => { custMap[c.id] = c.name })

  let overdueSent = 0
  for (const wo of (overdueRows || []) as WoRow[]) {
    if (!wo.engineer_id) continue
    if (await alreadyNotifiedToday(admin, 'work_order_overdue', wo.id)) continue
    await notifyUsers(admin, [{ userId: wo.engineer_id }], {
      type: 'work_order_overdue',
      title: `Overdue: ${wo.wo_number}`,
      body: `${custMap[wo.customer_id] || 'This notification'} was due for a follow-up and hasn't been closed out yet.`,
      entityType: 'work_order', entityId: wo.id, linkPath: `/mobile/work-orders/${wo.id}`,
    })
    overdueSent++
  }

  let reminderSent = 0
  for (const wo of (reminderRows || []) as WoRow[]) {
    if (!wo.engineer_id) continue
    if (await alreadyNotifiedToday(admin, 'work_order_reminder', wo.id)) continue
    await notifyUsers(admin, [{ userId: wo.engineer_id }], {
      type: 'work_order_reminder',
      title: `Scheduled tomorrow: ${wo.wo_number}`,
      body: `${custMap[wo.customer_id] || 'This notification'} is scheduled for tomorrow.`,
      entityType: 'work_order', entityId: wo.id, linkPath: `/mobile/work-orders/${wo.id}`,
    })
    reminderSent++
  }

  return NextResponse.json({ ok: true, overdueSent, reminderSent, overdueChecked: overdueRows?.length || 0, reminderChecked: reminderRows?.length || 0 })
}
