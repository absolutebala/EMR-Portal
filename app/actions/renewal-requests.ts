'use server'

import { adminClient } from '@/lib/db/admin-client'
import { getAuthedUser } from '@/lib/cognito/server'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'
import type { RenewalRequest, RenewalRequestType, RenewalRequestStatus } from '@/lib/types'

type Admin = ReturnType<typeof adminClient>

// Roles that can act on renewal requests at all (list + decisions). The two decision
// stages are further gated by the Approve / Final Approve permissions below.
const APPROVER_ROLES = ['Service Manager', 'Head of Service', 'Super Admin']

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Add whole years to a YYYY-MM-DD date, returning YYYY-MM-DD.
function addYears(dateIso: string, years: number): string {
  const d = new Date(dateIso + 'T00:00:00')
  d.setFullYear(d.getFullYear() + years)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function getActor(admin: Admin, userId: string) {
  const { data } = await admin.from('profiles').select('first_name, last_name, role').eq('id', userId).maybeSingle()
  return data as { first_name: string; last_name: string; role: string } | null
}

async function getPerms(admin: Admin, role: string): Promise<Record<string, boolean>> {
  const { data } = await admin.from('roles').select('permissions').eq('name', role).maybeSingle()
  return (data?.permissions as Record<string, boolean> | null) || {}
}

// Apply an approved extend/renew to the transformer: push the stored expiry forward and
// mark it back under warranty.
async function applyRenewal(admin: Admin, transformerId: string, newExpiry: string | null) {
  await admin.from('transformers')
    .update({ warranty_expiry_date: newExpiry, warranty_status: 'under_warranty' })
    .eq('id', transformerId)
}

// ── Request (from the customer detail page) ────────────────────────────────────
// Head of Service / Super Admin apply immediately. Service Manager starts at
// manager_approved (their own first-level is satisfied) and needs HoS final approval.
// Everyone else (Field Engineer, etc.) starts at pending → SM → HoS.
export async function requestRenewal(
  transformerId: string,
  input: { type: RenewalRequestType; years: number; comments: string | null }
): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }
    const years = Math.floor(Number(input.years))
    if (!years || years <= 0) return { error: 'Enter a valid number of years.' }

    const admin = adminClient()
    const actor = await getActor(admin, user.id)
    if (!actor) return { error: 'Account not found' }
    const actorName = `${actor.first_name} ${actor.last_name}`.trim()

    const { data: tx } = await admin.from('transformers')
      .select('id, serial_number, warranty_expiry_date, dispatch_date, warranty_years')
      .eq('id', transformerId).maybeSingle()
    if (!tx) return { error: 'Transformer not found' }

    // Block a second open request for the same transformer (the DB has a matching
    // partial unique index; this is the friendly message).
    const { data: open } = await admin.from('renewal_requests')
      .select('id').eq('transformer_id', transformerId).in('status', ['pending', 'manager_approved']).maybeSingle()
    if (open) return { error: 'There is already a renewal request awaiting approval for this serial number.' }

    // Current expiry: the stored date, or fall back to dispatch + warranty years.
    let previousExpiry: string | null = tx.warranty_expiry_date as string | null
    if (!previousExpiry && tx.dispatch_date && tx.warranty_years != null) {
      previousExpiry = addYears(tx.dispatch_date as string, tx.warranty_years as number)
    }
    // Extend adds to the current expiry (or today if unknown); renew starts fresh today.
    const newExpiry = input.type === 'extend'
      ? addYears(previousExpiry || todayIso(), years)
      : addYears(todayIso(), years)

    // Warranty extend/renew now applies immediately for everyone — the Renewal Requests
    // approval queue has been retired/hidden, so a pending request would have nowhere to
    // be actioned. The transformer update is the real effect and is the only awaited step
    // so the submit returns promptly; the history row + activity are best-effort.
    const now = new Date().toISOString()
    await applyRenewal(admin, transformerId, newExpiry)
    admin.from('renewal_requests').insert({
      transformer_id: transformerId, request_type: input.type, years, comments: input.comments,
      requested_by: user.id, status: 'approved', reviewed_by: user.id, reviewed_at: now,
      previous_expiry_date: previousExpiry, new_expiry_date: newExpiry,
    }).then(() => {}, () => {})
    logActivity(admin, { actorId: user.id, actorName, action: `${input.type === 'extend' ? 'Extended' : 'Renewed'} warranty for ${tx.serial_number} (${years} yr)`, entityType: 'transformer', entityId: transformerId }).catch(() => {})
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Approval page list ─────────────────────────────────────────────────────────
export async function getRenewalRequests(): Promise<{ items: RenewalRequest[]; error: string | null }> {
  const user = await getAuthedUser()
  if (!user) return { items: [], error: 'Not authenticated' }
  const admin = adminClient()
  const actor = await getActor(admin, user.id)
  if (!actor || !APPROVER_ROLES.includes(actor.role)) return { items: [], error: null }

  const { data: rows } = await admin.from('renewal_requests')
    .select('id, transformer_id, request_type, years, comments, requested_by, status, previous_expiry_date, new_expiry_date, created_at')
    .order('created_at', { ascending: false })
  if (!rows?.length) return { items: [], error: null }

  const txIds = [...new Set(rows.map(r => r.transformer_id))]
  const reqIds = [...new Set(rows.map(r => r.requested_by).filter(Boolean))] as string[]
  const [{ data: txs }, { data: people }] = await Promise.all([
    admin.from('transformers').select('id, serial_number, customer_id').in('id', txIds),
    reqIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', reqIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ])
  const custIds = [...new Set((txs || []).map(t => t.customer_id).filter(Boolean))] as string[]
  const { data: customers } = custIds.length
    ? await admin.from('customers').select('id, name').in('id', custIds)
    : { data: [] as { id: string; name: string }[] }

  const txById = Object.fromEntries((txs || []).map(t => [t.id, t]))
  const custById = Object.fromEntries((customers || []).map(c => [c.id, c.name]))
  const nameById = Object.fromEntries((people || []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()]))

  return {
    items: rows.map(r => {
      const tx = txById[r.transformer_id]
      return {
        id: r.id,
        transformerId: r.transformer_id,
        serialNumber: tx?.serial_number || '',
        customerId: (tx?.customer_id as string | null) ?? null,
        customerName: tx?.customer_id ? (custById[tx.customer_id as string] || '') : '',
        requestType: r.request_type as RenewalRequestType,
        years: r.years,
        comments: (r.comments as string | null) ?? null,
        requestedBy: (r.requested_by as string | null) ?? null,
        requestedByName: r.requested_by ? (nameById[r.requested_by as string] || 'User') : 'User',
        status: r.status as RenewalRequestStatus,
        previousExpiryDate: (r.previous_expiry_date as string | null) ?? null,
        newExpiryDate: (r.new_expiry_date as string | null) ?? null,
        createdAt: (r.created_at as string | null) ?? null,
      }
    }),
    error: null,
  }
}

// ── Stage 1: Service Manager (Renewal Requests — Approve) ──────────────────────
export async function submitRenewalManagerDecision(id: string, decision: 'approve' | 'reject'): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }
    const admin = adminClient()
    const actor = await getActor(admin, user.id)
    if (!actor) return { error: 'Account not found' }
    const isAdmin = actor.role === 'Super Admin' || actor.role === 'Head of Service'
    const perms = await getPerms(admin, actor.role)
    if (!isAdmin && perms['Renewal Requests — Approve'] !== true) return { error: 'You are not allowed to approve renewal requests.' }

    const { data: current } = await admin.from('renewal_requests').select('status, transformer_id, requested_by').eq('id', id).maybeSingle()
    if (current?.status !== 'pending') return { error: 'This request is no longer awaiting first-level approval.' }

    const actorName = `${actor.first_name} ${actor.last_name}`.trim()
    const now = new Date().toISOString()
    const patch = decision === 'approve'
      ? { status: 'manager_approved', manager_approved_by: user.id, manager_approved_at: now }
      : { status: 'rejected', reviewed_by: user.id, reviewed_at: now }
    const { error } = await admin.from('renewal_requests').update(patch).eq('id', id)
    if (error) return { error: error.message }

    logActivity(admin, { actorId: user.id, actorName, action: decision === 'approve' ? 'Approved renewal request (first level)' : 'Rejected renewal request', entityType: 'renewal_request', entityId: id }).catch(() => {})

    if (decision === 'approve') {
      notifyUsers(admin, [{ role: 'Head of Service' }, { role: 'Super Admin' }], {
        type: 'renewal_request', title: 'Warranty renewal awaiting final approval',
        body: `${actorName} approved a warranty renewal at the first level — it now needs final approval.`,
        entityType: 'renewal_request', entityId: id, linkPath: '/renewal-requests',
      }).catch(() => {})
    } else if (current.requested_by) {
      notifyUsers(admin, [{ userId: current.requested_by as string }], {
        type: 'renewal_request', title: 'Warranty renewal rejected',
        body: `${actorName} rejected your warranty renewal request.`,
        entityType: 'renewal_request', entityId: id, linkPath: '/renewal-requests',
      }).catch(() => {})
    }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Stage 2: Head of Service / Super Admin (Renewal Requests — Final Approve) ──
export async function submitRenewalHeadDecision(id: string, decision: 'approve' | 'reject'): Promise<{ error: string | null }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { error: 'Not authenticated' }
    const admin = adminClient()
    const actor = await getActor(admin, user.id)
    if (!actor) return { error: 'Account not found' }
    const isAdmin = actor.role === 'Super Admin' || actor.role === 'Head of Service'
    const perms = await getPerms(admin, actor.role)
    if (!isAdmin && perms['Renewal Requests — Final Approve'] !== true) return { error: 'You are not allowed to give final approval.' }

    const { data: current } = await admin.from('renewal_requests').select('status, transformer_id, requested_by, new_expiry_date').eq('id', id).maybeSingle()
    if (current?.status !== 'manager_approved') return { error: 'This request is not awaiting final approval.' }

    const actorName = `${actor.first_name} ${actor.last_name}`.trim()
    const status = decision === 'approve' ? 'approved' : 'rejected'
    const { error } = await admin.from('renewal_requests').update({
      status, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }

    if (decision === 'approve') {
      await applyRenewal(admin, current.transformer_id as string, (current.new_expiry_date as string | null) ?? null)
    }
    logActivity(admin, { actorId: user.id, actorName, action: `${decision === 'approve' ? 'Approved' : 'Rejected'} renewal request (final)`, entityType: 'renewal_request', entityId: id }).catch(() => {})

    if (current.requested_by) {
      notifyUsers(admin, [{ userId: current.requested_by as string }], {
        type: 'renewal_request', title: `Warranty renewal ${status}`,
        body: `${actorName} ${status} your warranty renewal request.`,
        entityType: 'renewal_request', entityId: id, linkPath: '/renewal-requests',
      }).catch(() => {})
    }
    return { error: null }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
