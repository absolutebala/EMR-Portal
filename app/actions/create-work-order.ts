'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient } from '@/lib/supabase/server'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function createWorkOrder(payload: {
  wo_number: string
  job_type: string
  customer_id: string
  transformer_ids: string[]
  engineer_id: string | null
  scheduled_date: string | null
  notes: string | null
}): Promise<{ error: string | null; id?: string }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()

    // Check WO number uniqueness
    const { data: existing } = await admin.from('work_orders').select('id').eq('wo_number', payload.wo_number).maybeSingle()
    if (existing) return { error: `Work order number "${payload.wo_number}" already exists.` }

    const status = payload.engineer_id ? 'assigned' : 'unassigned'

    // Verify creator profile exists (FK requires profiles.id match)
    const { data: creator } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()

    const { data: wo, error } = await admin.from('work_orders').insert({
      wo_number: payload.wo_number,
      job_type: payload.job_type,
      customer_id: payload.customer_id,
      engineer_id: payload.engineer_id || null,
      scheduled_date: payload.scheduled_date || null,
      status,
      notes: payload.notes || null,
      created_by: creator ? user.id : null,
    }).select('id').single()

    if (error) return { error: error.message }

    // Link transformers
    if (payload.transformer_ids.length) {
      await admin.from('work_order_transformers').insert(
        payload.transformer_ids.map(tid => ({ work_order_id: wo.id, transformer_id: tid }))
      )
    }

    // Log creation activity
    const actorName = creator ? `${creator.first_name} ${creator.last_name}` : 'Admin'

    const activityRows = [{ work_order_id: wo.id, action: `Work order created by ${actorName}`, actor_name: actorName }]
    if (payload.engineer_id) {
      const { data: eng } = await admin.from('profiles').select('first_name, last_name').eq('id', payload.engineer_id).single()
      const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
      activityRows.push({ work_order_id: wo.id, action: `Assigned to ${engName}`, actor_name: actorName })
    }
    await admin.from('work_order_activity').insert(activityRows)

    return { error: null, id: wo.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateWorkOrderStatus(id: string, status: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('work_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).single()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const label: Record<string, string> = { in_progress: 'In Progress', pending: 'Pending', completed: 'Completed' }
    await admin.from('work_order_activity').insert({ work_order_id: id, action: `Status updated to ${label[status] || status}`, actor_name: actorName })

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
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()

    // Fetch current WO to detect changes
    const { data: current } = await admin.from('work_orders').select('wo_number, engineer_id, status').eq('id', id).single()
    if (!current) return { error: 'Work order not found' }

    // Check WO number uniqueness (skip if unchanged)
    if (payload.wo_number !== current.wo_number) {
      const { data: dup } = await admin.from('work_orders').select('id').eq('wo_number', payload.wo_number).maybeSingle()
      if (dup) return { error: `Work order number "${payload.wo_number}" already exists.` }
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
    }).eq('id', id)
    if (updateErr) return { error: updateErr.message }

    // Replace transformers
    await admin.from('work_order_transformers').delete().eq('work_order_id', id)
    if (payload.transformer_ids.length) {
      await admin.from('work_order_transformers').insert(
        payload.transformer_ids.map(tid => ({ work_order_id: id, transformer_id: tid }))
      )
    }

    // Activity log
    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const activityRows: { work_order_id: string; action: string; actor_name: string }[] = [
      { work_order_id: id, action: `Work order updated by ${actorName}`, actor_name: actorName },
    ]
    if (payload.engineer_id && payload.engineer_id !== current.engineer_id) {
      const { data: eng } = await admin.from('profiles').select('first_name, last_name').eq('id', payload.engineer_id).single()
      const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
      const verb = current.engineer_id ? 'Reassigned' : 'Assigned'
      activityRows.push({ work_order_id: id, action: `${verb} to ${engName}`, actor_name: actorName })
    }
    await admin.from('work_order_activity').insert(activityRows)

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function reassignWorkOrderEngineer(id: string, engineerId: string): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('work_orders').update({ engineer_id: engineerId, status: 'assigned', updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }

    const [{ data: actor }, { data: eng }] = await Promise.all([
      admin.from('profiles').select('first_name, last_name').eq('id', user.id).single(),
      admin.from('profiles').select('first_name, last_name').eq('id', engineerId).single(),
    ])
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    const engName = eng ? `${eng.first_name} ${eng.last_name}` : 'Engineer'
    await admin.from('work_order_activity').insert({ work_order_id: id, action: `Reassigned to ${engName}`, actor_name: actorName })

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
