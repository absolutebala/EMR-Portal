'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import { sendWhatsApp } from '@/lib/messaging/whatsapp'

function formatScheduledDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not scheduled'
}

async function serialNumbersForTransformerIds(admin: ReturnType<typeof adminClient>, transformerIds: string[]): Promise<string> {
  if (!transformerIds.length) return ''
  const { data } = await admin.from('transformers').select('serial_number').in('id', transformerIds)
  return (data || []).map(t => t.serial_number).filter(Boolean).join(', ')
}

async function serialNumbersForWorkOrder(admin: ReturnType<typeof adminClient>, workOrderId: string): Promise<string> {
  const { data } = await admin.from('work_order_transformers').select('transformers(serial_number)').eq('work_order_id', workOrderId)
  return (data || [])
    .map(row => {
      const t = (row as { transformers?: unknown }).transformers
      const obj = Array.isArray(t) ? t[0] : t
      return (obj as { serial_number?: string } | null)?.serial_number || null
    })
    .filter(Boolean)
    .join(', ')
}

function todayDatePrefix(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}${mm}${dd}`
}

// YYYYMMDD-N, N resetting each day. Computed from the highest existing N for
// today's prefix rather than a plain count, so it stays correct even if a
// previous attempt failed partway through (see the retry loop below). Existing
// historical ticket numbers keep their old DDMMYYYY-N format — only new ones use
// this format going forward.
async function nextTicketNumber(admin: ReturnType<typeof adminClient>): Promise<string> {
  const prefix = todayDatePrefix()
  const { data } = await admin.from('work_orders').select('ticket_number').like('ticket_number', `${prefix}-%`)
  let max = 0
  for (const row of data || []) {
    const n = parseInt((row.ticket_number || '').split('-')[1] || '0', 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `${prefix}-${max + 1}`
}

export async function getNextTicketNumberPreview(): Promise<{ ticketNumber: string }> {
  const admin = adminClient()
  return { ticketNumber: await nextTicketNumber(admin) }
}

export async function createWorkOrder(payload: {
  // Blank is allowed — falls back to the auto-generated ticket number (see
  // nextTicketNumber below), matching how ticket_number is already generated
  // rather than user-entered.
  wo_number: string
  job_type: string
  // Overhauling jobs can be created with all details filled in later — every other
  // field here was already optional; customer/serial numbers are the last two that
  // used to be mandatory everywhere.
  customer_id: string | null
  transformer_ids: string[]
  engineer_id: string | null
  scheduled_date: string | null
  notes: string | null
  reported_date: string | null
  reported_through: string | null
  customer_message: string | null
  solution_through: string | null
  additional_engineer_ids: string[]
  customer_type: string | null
  customer_category_id: string | null
  department_id: string | null
}): Promise<{ error: string | null; id?: string }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()

    // Check WO number uniqueness — skipped when blank, since a blank one always
    // falls back to the ticket number below, which is already guaranteed unique.
    const woNumberInput = payload.wo_number.trim()
    if (woNumberInput) {
      const { data: existing } = await admin.from('work_orders').select('id').eq('wo_number', woNumberInput).maybeSingle()
      if (existing) return { error: `Notification number "${woNumberInput}" already exists.` }
    }

    const status = payload.engineer_id ? 'assigned' : 'unassigned'

    // Verify creator profile exists (FK requires profiles.id match)
    const { data: creator } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()

    // Retry on a rare race against another concurrent create landing the same
    // ticket_number first — ticket_number has a unique constraint (030 migration).
    let wo: { id: string; wo_number: string } | null = null
    let insertError: { code?: string; message: string } | null = null
    for (let attempt = 0; attempt < 5 && !wo; attempt++) {
      const ticketNumber = await nextTicketNumber(admin)
      const { data, error } = await admin.from('work_orders').insert({
        wo_number: woNumberInput || ticketNumber,
        ticket_number: ticketNumber,
        job_type: payload.job_type,
        customer_id: payload.customer_id || null,
        engineer_id: payload.engineer_id || null,
        scheduled_date: payload.scheduled_date || null,
        status,
        notes: payload.notes || null,
        created_by: creator ? user.id : null,
        reported_date: payload.reported_date || null,
        reported_through: payload.reported_through || null,
        customer_message: payload.customer_message || null,
        solution_through: payload.solution_through || null,
        customer_type: payload.customer_type || null,
        customer_category_id: payload.customer_category_id || null,
        department_id: payload.department_id || null,
      }).select('id, wo_number').single()
      if (data) { wo = data; break }
      insertError = error
      if (error?.code !== '23505') break
    }
    if (!wo) return { error: insertError?.message || 'Could not create notification.' }
    const woNumber = wo.wo_number

    // Link transformers
    if (payload.transformer_ids.length) {
      await admin.from('work_order_transformers').insert(
        payload.transformer_ids.map(tid => ({ work_order_id: wo.id, transformer_id: tid }))
      )
    }

    // Additional (visibility-only) engineers for a Virtual-solution job — see
    // work_order_additional_engineers comment in migration 035.
    if (payload.solution_through === 'virtual' && payload.additional_engineer_ids.length) {
      await admin.from('work_order_additional_engineers').insert(
        payload.additional_engineer_ids.map(engineerId => ({ work_order_id: wo!.id, engineer_id: engineerId }))
      )
    }

    // Log creation activity
    const actorName = creator ? `${creator.first_name} ${creator.last_name}` : 'Admin'

    const activityRows = [{ work_order_id: wo.id, action: `Notification created by ${actorName}`, actor_name: actorName }]
    let assignedEngineer: { first_name: string; last_name: string; phone: string | null } | null = null
    if (payload.engineer_id) {
      const { data: eng } = await admin.from('profiles').select('first_name, last_name, phone').eq('id', payload.engineer_id).single()
      assignedEngineer = eng
      const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
      activityRows.push({ work_order_id: wo.id, action: `Assigned to ${engName}`, actor_name: actorName })
    }
    await admin.from('work_order_activity').insert(activityRows)
    await logActivity(admin, { actorId: user.id, actorName, action: `Created notification ${woNumber}`, entityType: 'work_order', entityId: wo.id })

    if (payload.engineer_id) {
      notifyUsers(admin, [{ userId: payload.engineer_id }], {
        type: 'work_order_assigned',
        title: `New notification assigned: ${woNumber}`,
        body: `${actorName} assigned you a new notification.`,
        entityType: 'work_order', entityId: wo.id, linkPath: `/mobile/work-orders/${wo.id}`,
      }).catch(() => {})

      const [{ data: customer }, serials] = await Promise.all([
        payload.customer_id
          ? admin.from('customers').select('name, contact_person, phone, whatsapp_number').eq('id', payload.customer_id).maybeSingle()
          : Promise.resolve({ data: null }),
        serialNumbersForTransformerIds(admin, payload.transformer_ids),
      ])
      const engName = assignedEngineer ? `${assignedEngineer.first_name} ${assignedEngineer.last_name}` : 'Engineer'
      const scheduledLabel = formatScheduledDate(payload.scheduled_date)

      sendWhatsApp(admin, 'assigned_engineer', [{ phone: assignedEngineer?.phone, userName: assignedEngineer?.first_name || 'Engineer' }],
        [assignedEngineer?.first_name || 'Engineer', woNumber, customer?.name || '', serials, scheduledLabel]).catch(() => {})

      if (customer) {
        sendWhatsApp(admin, 'assigned_customer', [{ phone: customer.whatsapp_number || customer.phone, userName: customer.contact_person }],
          [customer.contact_person, woNumber, engName, serials, scheduledLabel]).catch(() => {})
      }
    }

    return { error: null, id: wo.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateWorkOrderStatus(id: string, status: string): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('work_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const label: Record<string, string> = { in_progress: 'In Progress', pending: 'Pending', completed: 'Completed' }
    await admin.from('work_order_activity').insert({ work_order_id: id, action: `Status updated to ${label[status] || status}`, actor_name: actorName })
    await logActivity(admin, { actorId: user.id, actorName, action: `Updated notification status to ${label[status] || status}`, entityType: 'work_order', entityId: id })

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateWorkOrder(id: string, payload: {
  wo_number: string
  job_type: string
  transformer_ids: string[]
  engineer_id: string | null
  scheduled_date: string | null
  notes: string | null
  reported_date: string | null
  reported_through: string | null
  customer_message: string | null
  solution_through: string | null
  additional_engineer_ids: string[]
  customer_type: string | null
  customer_category_id: string | null
  department_id: string | null
}): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()

    // Fetch current WO to detect changes
    const { data: current } = await admin.from('work_orders').select('wo_number, engineer_id, status, customer_id').eq('id', id).single()
    if (!current) return { error: 'Notification not found' }

    // Check WO number uniqueness (skip if unchanged)
    if (payload.wo_number !== current.wo_number) {
      const { data: dup } = await admin.from('work_orders').select('id').eq('wo_number', payload.wo_number).maybeSingle()
      if (dup) return { error: `Notification number "${payload.wo_number}" already exists.` }
    }

    // Adjust status when engineer assignment changes
    let status = current.status
    if (!payload.engineer_id && (current.status === 'assigned' || current.status === 'in_progress')) status = 'unassigned'
    if (payload.engineer_id && current.status === 'unassigned') status = 'assigned'

    const { error: updateErr } = await admin.from('work_orders').update({
      wo_number: payload.wo_number,
      job_type: payload.job_type,
      engineer_id: payload.engineer_id || null,
      scheduled_date: payload.scheduled_date || null,
      notes: payload.notes || null,
      status,
      updated_at: new Date().toISOString(),
      reported_date: payload.reported_date || null,
      reported_through: payload.reported_through || null,
      customer_message: payload.customer_message || null,
      solution_through: payload.solution_through || null,
      customer_type: payload.customer_type || null,
      customer_category_id: payload.customer_category_id || null,
      department_id: payload.department_id || null,
    }).eq('id', id)
    if (updateErr) return { error: updateErr.message }

    // Replace transformers
    await admin.from('work_order_transformers').delete().eq('work_order_id', id)
    if (payload.transformer_ids.length) {
      await admin.from('work_order_transformers').insert(
        payload.transformer_ids.map(tid => ({ work_order_id: id, transformer_id: tid }))
      )
    }

    // An additional engineer's serial carve-out (work_order_engineer_assignments)
    // can be left pointing at a transformer that's no longer on this WO if an admin
    // just removed that serial number above — clean up the orphan rather than leaving
    // a stale assignment.
    if (payload.transformer_ids.length) {
      await admin.from('work_order_engineer_assignments').delete().eq('work_order_id', id).not('transformer_id', 'in', `(${payload.transformer_ids.join(',')})`)
    } else {
      await admin.from('work_order_engineer_assignments').delete().eq('work_order_id', id).not('transformer_id', 'is', null)
    }

    // Replace additional (visibility-only) engineers — only meaningful when
    // the solution is Virtual, so an empty list clears them either way.
    await admin.from('work_order_additional_engineers').delete().eq('work_order_id', id)
    if (payload.solution_through === 'virtual' && payload.additional_engineer_ids.length) {
      await admin.from('work_order_additional_engineers').insert(
        payload.additional_engineer_ids.map(engineerId => ({ work_order_id: id, engineer_id: engineerId }))
      )
    }

    // Activity log
    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const activityRows: { work_order_id: string; action: string; actor_name: string }[] = [
      { work_order_id: id, action: `Notification updated by ${actorName}`, actor_name: actorName },
    ]
    if (payload.engineer_id && payload.engineer_id !== current.engineer_id) {
      const { data: eng } = await admin.from('profiles').select('first_name, last_name, phone').eq('id', payload.engineer_id).single()
      const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
      const verb = current.engineer_id ? 'Reassigned' : 'Assigned'
      activityRows.push({ work_order_id: id, action: `${verb} to ${engName}`, actor_name: actorName })

      notifyUsers(admin, [{ userId: payload.engineer_id }], {
        type: 'work_order_assigned',
        title: `${verb === 'Reassigned' ? 'Notification reassigned to you' : 'New notification assigned'}: ${payload.wo_number}`,
        body: `${actorName} ${verb.toLowerCase()} you this notification.`,
        entityType: 'work_order', entityId: id, linkPath: `/mobile/work-orders/${id}`,
      }).catch(() => {})

      const [{ data: customer }, serials] = await Promise.all([
        admin.from('customers').select('name, contact_person, phone, whatsapp_number').eq('id', current.customer_id).maybeSingle(),
        serialNumbersForTransformerIds(admin, payload.transformer_ids),
      ])
      const scheduledLabel = formatScheduledDate(payload.scheduled_date)
      sendWhatsApp(admin, 'assigned_engineer', [{ phone: eng?.phone, userName: eng?.first_name || 'Engineer' }],
        [eng?.first_name || 'Engineer', payload.wo_number, customer?.name || '', serials, scheduledLabel]).catch(() => {})
      if (customer) {
        sendWhatsApp(admin, 'assigned_customer', [{ phone: customer.whatsapp_number || customer.phone, userName: customer.contact_person }],
          [customer.contact_person, payload.wo_number, engName, serials, scheduledLabel]).catch(() => {})
      }

      // The previous engineer flagged this job "needs reassignment" during closure —
      // let them know it's been picked up now that someone else has it.
      if (current.status === 'needs_reassignment' && current.engineer_id) {
        notifyUsers(admin, [{ userId: current.engineer_id }], {
          type: 'work_order_reassignment_completed',
          title: `Reassignment completed: ${payload.wo_number}`,
          body: `${engName} has been assigned to take over this notification.`,
          entityType: 'work_order', entityId: id, linkPath: `/mobile/work-orders/${id}`,
        }).catch(() => {})
      }
    }
    await admin.from('work_order_activity').insert(activityRows)
    await logActivity(admin, { actorId: user.id, actorName, action: `Updated notification ${payload.wo_number}`, entityType: 'work_order', entityId: id })

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function reassignWorkOrderEngineer(id: string, engineerId: string, scheduledDate?: string | null): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { data: current } = await admin.from('work_orders').select('wo_number, engineer_id, status, customer_id').eq('id', id).maybeSingle()

    const { error } = await admin.from('work_orders').update({
      engineer_id: engineerId,
      status: 'assigned',
      scheduled_date: scheduledDate || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }

    const [{ data: actor }, { data: eng }] = await Promise.all([
      admin.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
      admin.from('profiles').select('first_name, last_name, phone').eq('id', engineerId).single(),
    ])
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
    const dateSuffix = scheduledDate ? ` for ${new Date(scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''
    await admin.from('work_order_activity').insert({ work_order_id: id, action: `Reassigned to ${engName}${dateSuffix}`, actor_name: actorName })
    await logActivity(admin, { actorId: user.id, actorName, action: `Reassigned notification to ${engName}${dateSuffix}`, entityType: 'work_order', entityId: id })

    if (engineerId !== current?.engineer_id) {
      notifyUsers(admin, [{ userId: engineerId }], {
        type: 'work_order_assigned',
        title: `Notification reassigned to you${current?.wo_number ? `: ${current.wo_number}` : ''}`,
        body: `${actorName} reassigned you this notification.`,
        entityType: 'work_order', entityId: id, linkPath: `/mobile/work-orders/${id}`,
      }).catch(() => {})

      if (current?.customer_id) {
        const [{ data: customer }, serials] = await Promise.all([
          admin.from('customers').select('name, contact_person, phone, whatsapp_number').eq('id', current.customer_id).maybeSingle(),
          serialNumbersForWorkOrder(admin, id),
        ])
        const scheduledLabel = formatScheduledDate(scheduledDate)
        sendWhatsApp(admin, 'assigned_engineer', [{ phone: eng?.phone, userName: eng?.first_name || 'Engineer' }],
          [eng?.first_name || 'Engineer', current.wo_number || '', customer?.name || '', serials, scheduledLabel]).catch(() => {})
        if (customer) {
          sendWhatsApp(admin, 'assigned_customer', [{ phone: customer.whatsapp_number || customer.phone, userName: customer.contact_person }],
            [customer.contact_person, current.wo_number || '', engName, serials, scheduledLabel]).catch(() => {})
        }
      }

      if (current?.status === 'needs_reassignment' && current.engineer_id) {
        notifyUsers(admin, [{ userId: current.engineer_id }], {
          type: 'work_order_reassignment_completed',
          title: `Reassignment completed${current.wo_number ? `: ${current.wo_number}` : ''}`,
          body: `${engName} has been assigned to take over this notification.`,
          entityType: 'work_order', entityId: id, linkPath: `/mobile/work-orders/${id}`,
        }).catch(() => {})
      }
    }

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Real multi-engineer assignment (work_order_engineer_assignments) — distinct from
// work_order_additional_engineers, the pre-existing visibility-only list for Virtual
// participants. An engineer added here gets the job on their own mobile "my jobs"
// list and can independently check in/close for it (see fetchEngineerWorkOrders /
// submitCheckInCore / submitDailyClosureCore) — the primary work_orders.engineer_id
// stays the sole driver of the notification's own status field.
export async function addAdditionalEngineer(workOrderId: string, engineerId: string, transformerIds: string[]): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { data: wo } = await admin.from('work_orders').select('wo_number, engineer_id, customer_id').eq('id', workOrderId).maybeSingle()
    if (!wo) return { error: 'Notification not found' }
    if (wo.engineer_id === engineerId) return { error: 'This engineer is already the primary assignee.' }

    const { data: existing } = await admin.from('work_order_engineer_assignments').select('id').eq('work_order_id', workOrderId).eq('engineer_id', engineerId).limit(1)
    if (existing?.length) return { error: 'This engineer is already assigned to this notification.' }

    const rows: { work_order_id: string; engineer_id: string; transformer_id: string | null; assigned_by: string }[] = transformerIds.length
      ? transformerIds.map(tid => ({ work_order_id: workOrderId, engineer_id: engineerId, transformer_id: tid, assigned_by: user.id }))
      : [{ work_order_id: workOrderId, engineer_id: engineerId, transformer_id: null, assigned_by: user.id }]
    const { error: insertErr } = await admin.from('work_order_engineer_assignments').insert(rows)
    if (insertErr) return { error: insertErr.message }

    const [{ data: actor }, { data: eng }] = await Promise.all([
      admin.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
      admin.from('profiles').select('first_name, last_name, phone').eq('id', engineerId).single(),
    ])
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'

    await admin.from('work_order_activity').insert({ work_order_id: workOrderId, action: `Added ${engName} as an additional engineer`, actor_name: actorName })
    await logActivity(admin, { actorId: user.id, actorName, action: `Added ${engName} as an additional engineer on ${wo.wo_number}`, entityType: 'work_order', entityId: workOrderId })

    notifyUsers(admin, [{ userId: engineerId }], {
      type: 'work_order_assigned',
      title: `New notification assigned: ${wo.wo_number}`,
      body: `${actorName} assigned you to this notification.`,
      entityType: 'work_order', entityId: workOrderId, linkPath: `/mobile/work-orders/${workOrderId}`,
    }).catch(() => {})

    // No customer-facing WhatsApp here — that stays a primary-assignment-only send,
    // the customer doesn't need a message per additional engineer added.
    const serials = await serialNumbersForTransformerIds(admin, transformerIds)
    sendWhatsApp(admin, 'assigned_engineer', [{ phone: eng?.phone, userName: eng?.first_name || 'Engineer' }],
      [eng?.first_name || 'Engineer', wo.wo_number || '', '', serials, formatScheduledDate(null)]).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function removeAdditionalEngineer(workOrderId: string, engineerId: string): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const [{ data: wo }, { data: actor }, { data: eng }] = await Promise.all([
      admin.from('work_orders').select('wo_number').eq('id', workOrderId).maybeSingle(),
      admin.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
      admin.from('profiles').select('first_name, last_name').eq('id', engineerId).single(),
    ])
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'

    const { error } = await admin.from('work_order_engineer_assignments').delete().eq('work_order_id', workOrderId).eq('engineer_id', engineerId)
    if (error) return { error: error.message }

    await admin.from('work_order_activity').insert({ work_order_id: workOrderId, action: `Removed ${engName} as an additional engineer`, actor_name: actorName })
    await logActivity(admin, { actorId: user.id, actorName, action: `Removed ${engName} from ${wo?.wo_number || 'a notification'}`, entityType: 'work_order', entityId: workOrderId })

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// Read-side helper for the WO detail admin panel: additional engineers grouped
// with the serial number(s) (if any) they're carved out for.
export interface AdditionalEngineerAssignment {
  engineerId: string
  engineerName: string
  serialNumbers: string[] // empty = whole notification, no split
}

export async function getAdditionalEngineers(workOrderId: string): Promise<{ assignments: AdditionalEngineerAssignment[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: rows, error } = await admin
      .from('work_order_engineer_assignments')
      .select('engineer_id, transformer_id, profiles!work_order_engineer_assignments_engineer_id_fkey(first_name, last_name), transformers(serial_number)')
      .eq('work_order_id', workOrderId)
    if (error) return { assignments: [], error: error.message }

    type Row = { engineer_id: string; transformer_id: string | null; profiles: unknown; transformers: unknown }
    const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] as T | undefined) ?? null : (v as T | null))

    const byEngineer = new Map<string, AdditionalEngineerAssignment>()
    for (const r of (rows as unknown as Row[]) || []) {
      const profile = one<{ first_name: string; last_name: string }>(r.profiles)
      const transformer = one<{ serial_number: string }>(r.transformers)
      const existing = byEngineer.get(r.engineer_id)
      const name = profile ? `${profile.first_name} ${profile.last_name}` : 'Engineer'
      if (existing) {
        if (transformer?.serial_number) existing.serialNumbers.push(transformer.serial_number)
      } else {
        byEngineer.set(r.engineer_id, { engineerId: r.engineer_id, engineerName: name, serialNumbers: transformer?.serial_number ? [transformer.serial_number] : [] })
      }
    }
    return { assignments: [...byEngineer.values()], error: null }
  } catch (e: unknown) {
    return { assignments: [], error: e instanceof Error ? e.message : String(e) }
  }
}
