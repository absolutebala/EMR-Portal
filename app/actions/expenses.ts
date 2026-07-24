'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as serverClient, getAuthedUser } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

export interface ExpenseType {
  id: string
  name: string
}

// ---------- Expense type catalog (admin-managed, inline-create) ----------

export async function getExpenseTypes(): Promise<{ types: ExpenseType[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data, error } = await admin.from('expense_types').select('id, name').order('name')
    if (error) return { types: [], error: error.message }
    return { types: data || [], error: null }
  } catch (e: unknown) {
    return { types: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getOrCreateExpenseType(name: string): Promise<{ type: ExpenseType | null; error: string | null }> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { type: null, error: 'Name is required' }

    const admin = adminClient()
    const { data: existing } = await admin.from('expense_types').select('id, name').ilike('name', trimmed).maybeSingle()
    if (existing) return { type: existing, error: null }

    const { data: created, error } = await admin.from('expense_types').insert({ name: trimmed }).select('id, name').single()
    if (error) return { type: null, error: error.message }
    return { type: created, error: null }
  } catch (e: unknown) {
    return { type: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------- Expense logs ----------

export interface ExpenseLogView {
  id: string
  workOrderId: string
  woNumber: string
  projectLabel: string
  customerName: string
  expenseTypeId: string
  expenseTypeName: string
  expenseDate: string
  amount: number
  photoUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  engineerId: string | null
  engineerName: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
}

type RawExpenseLog = {
  id: string; work_order_id: string; engineer_id: string | null; expense_type_id: string
  expense_date: string; amount: number; photo_url: string | null; status: string
  reviewed_by: string | null; reviewed_at: string | null; created_at: string
}

async function buildExpenseLogViews(admin: ReturnType<typeof adminClient>, rows: RawExpenseLog[]): Promise<ExpenseLogView[]> {
  if (!rows.length) return []

  const woIds = [...new Set(rows.map(r => r.work_order_id))]
  const typeIds = [...new Set(rows.map(r => r.expense_type_id))]
  const peopleIds = [...new Set([...rows.map(r => r.engineer_id), ...rows.map(r => r.reviewed_by)].filter(Boolean))] as string[]

  const [{ data: wos }, { data: types }, { data: people }, { data: wotRows }] = await Promise.all([
    admin.from('work_orders').select('id, wo_number, customer_id').in('id', woIds),
    admin.from('expense_types').select('id, name').in('id', typeIds),
    peopleIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', peopleIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    admin.from('work_order_transformers').select('work_order_id, transformers(customer_sites(site_name))').in('work_order_id', woIds),
  ])

  type WoRow = { id: string; wo_number: string; customer_id: string }
  const woRows = (wos as WoRow[]) || []
  const customerIds = [...new Set(woRows.map(w => w.customer_id))]
  const { data: customers } = customerIds.length
    ? await admin.from('customers').select('id, name').in('id', customerIds)
    : { data: [] as { id: string; name: string }[] }

  const woMap: Record<string, WoRow> = {}
  woRows.forEach(w => { woMap[w.id] = w })
  const custMap: Record<string, string> = {}
  ;(customers || []).forEach(c => { custMap[c.id] = c.name })
  const typeMap: Record<string, string> = {}
  ;(types || []).forEach(t => { typeMap[t.id] = t.name })
  const nameMap: Record<string, string> = {}
  ;(people || []).forEach(p => { nameMap[p.id] = `${p.first_name} ${p.last_name}` })

  type WotRow = { work_order_id: string; transformers: { customer_sites: { site_name: string } | null } | null }
  const siteMap: Record<string, string> = {}
  ;((wotRows as unknown as WotRow[]) || []).forEach(r => {
    const siteName = r.transformers?.customer_sites?.site_name
    if (siteName && !siteMap[r.work_order_id]) siteMap[r.work_order_id] = siteName
  })

  return rows
    .map(r => {
      const wo = woMap[r.work_order_id]
      const customerName = wo ? (custMap[wo.customer_id] || '') : ''
      const siteName = siteMap[r.work_order_id] || null
      return {
        id: r.id,
        workOrderId: r.work_order_id,
        woNumber: wo?.wo_number || '',
        projectLabel: siteName || customerName || '—',
        customerName,
        expenseTypeId: r.expense_type_id,
        expenseTypeName: typeMap[r.expense_type_id] || 'Unknown',
        expenseDate: r.expense_date,
        amount: Number(r.amount),
        photoUrl: r.photo_url,
        status: r.status as ExpenseLogView['status'],
        engineerId: r.engineer_id,
        engineerName: r.engineer_id ? (nameMap[r.engineer_id] || 'Engineer') : null,
        reviewedByName: r.reviewed_by ? (nameMap[r.reviewed_by] || null) : null,
        reviewedAt: r.reviewed_at,
        createdAt: r.created_at,
      }
    })
    .sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : a.expenseDate > b.expenseDate ? -1 : (a.createdAt < b.createdAt ? 1 : -1)))
}

export async function submitExpenseLog(params: {
  workOrderId: string
  expenseTypeId: string
  expenseDate: string
  amount: number
  photo?: { base64: string; mimeType: string; ext: string }
}): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }
    if (!params.workOrderId) return { error: 'Select a project' }
    if (!params.expenseTypeId) return { error: 'Select an expense type' }
    if (!params.expenseDate) return { error: 'Select a date' }
    if (!params.amount || params.amount <= 0) return { error: 'Enter a valid amount' }

    const admin = adminClient()

    let photoUrl: string | null = null
    if (params.photo) {
      const base64 = params.photo.base64.split(',')[1] ?? params.photo.base64
      const buffer = Buffer.from(base64, 'base64')
      const path = `expenses/${params.workOrderId}-${Date.now()}.${params.photo.ext}`
      const upResult = await withTimeout(
        admin.storage.from('assets').upload(path, buffer, { upsert: true, contentType: params.photo.mimeType }),
        25000
      )
      if (upResult && !upResult.error) {
        photoUrl = admin.storage.from('assets').getPublicUrl(path).data.publicUrl
      } else {
        console.error('submitExpenseLog: receipt photo upload failed', upResult?.error)
      }
    }

    const { data: inserted, error } = await admin.from('expense_logs').insert({
      work_order_id: params.workOrderId,
      engineer_id: user.id,
      expense_type_id: params.expenseTypeId,
      expense_date: params.expenseDate,
      amount: params.amount,
      photo_url: photoUrl,
    }).select('id').single()
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    const { data: wo } = await admin.from('work_orders').select('wo_number').eq('id', params.workOrderId).maybeSingle()
    logActivity(admin, {
      actorId: user.id, actorName,
      action: `Logged an expense for notification ${wo?.wo_number || ''}`,
      entityType: 'expense_log', entityId: inserted?.id,
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getMyExpenseLogs(): Promise<{ logs: ExpenseLogView[]; error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { logs: [], error: 'Not authenticated' }

    const admin = adminClient()
    const { data: rows, error } = await admin.from('expense_logs').select('*').eq('engineer_id', user.id)
    if (error) return { logs: [], error: error.message }
    const logs = await buildExpenseLogViews(admin, (rows as RawExpenseLog[]) || [])
    return { logs, error: null }
  } catch (e: unknown) {
    return { logs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getAllExpenseLogs(): Promise<{ logs: ExpenseLogView[]; error: string | null }> {
  try {
    const admin = adminClient()
    const { data: rows, error } = await admin.from('expense_logs').select('*').order('created_at', { ascending: false })
    if (error) return { logs: [], error: error.message }
    const logs = await buildExpenseLogViews(admin, (rows as RawExpenseLog[]) || [])
    return { logs, error: null }
  } catch (e: unknown) {
    return { logs: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateExpenseLogStatus(id: string, status: 'approved' | 'rejected'): Promise<{ error: string | null }> {
  try {
    const sb = await serverClient()
    const user = await getAuthedUser(sb)
    if (!user) return { error: 'Not authenticated' }

    const admin = adminClient()
    const { error } = await admin.from('expense_logs').update({
      status, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Admin'
    logActivity(admin, {
      actorId: user.id, actorName,
      action: `${status === 'approved' ? 'Approved' : 'Rejected'} expense log`,
      entityType: 'expense_log', entityId: id,
    }).catch(() => {})

    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
