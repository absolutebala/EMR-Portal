'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface AttendanceEngineer {
  id: string
  name: string
}

// engineerId -> 'YYYY-MM-DD' -> customer names scheduled that day (usually one,
// but an engineer can have more than one job on the same date).
export type AttendanceCells = Record<string, Record<string, string[]>>

export async function getAttendanceGrid(): Promise<{
  engineers: AttendanceEngineer[]
  dates: string[]
  cells: AttendanceCells
  error: string | null
}> {
  try {
    const admin = adminClient()

    const { data: profiles, error: profErr } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'Field Engineer')
      .order('first_name')
    if (profErr) return { engineers: [], dates: [], cells: {}, error: profErr.message }

    const engineers: AttendanceEngineer[] = (profiles || []).map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }))

    // Today through the last day of the current month.
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA')
    const lastDayStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA')

    const dates: string[] = []
    const cursor = new Date(`${todayStr}T00:00:00`)
    const end = new Date(`${lastDayStr}T00:00:00`)
    while (cursor <= end) {
      dates.push(cursor.toLocaleDateString('en-CA'))
      cursor.setDate(cursor.getDate() + 1)
    }

    if (!engineers.length) return { engineers, dates, cells: {}, error: null }

    const engineerIds = engineers.map(e => e.id)
    const { data: wos } = await admin
      .from('work_orders')
      .select('engineer_id, scheduled_date, customer_id')
      .in('engineer_id', engineerIds)
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', lastDayStr)

    const customerIds = [...new Set((wos || []).map(w => w.customer_id).filter(Boolean))]
    const { data: customers } = customerIds.length
      ? await admin.from('customers').select('id, name').in('id', customerIds)
      : { data: [] as { id: string; name: string }[] }
    const custMap: Record<string, string> = {}
    customers?.forEach(c => { custMap[c.id] = c.name })

    const cells: AttendanceCells = {}
    for (const w of wos || []) {
      if (!w.engineer_id || !w.scheduled_date) continue
      if (!cells[w.engineer_id]) cells[w.engineer_id] = {}
      if (!cells[w.engineer_id][w.scheduled_date]) cells[w.engineer_id][w.scheduled_date] = []
      cells[w.engineer_id][w.scheduled_date].push(custMap[w.customer_id] || 'Unknown customer')
    }

    return { engineers, dates, cells, error: null }
  } catch (e: unknown) {
    return { engineers: [], dates: [], cells: {}, error: e instanceof Error ? e.message : String(e) }
  }
}
