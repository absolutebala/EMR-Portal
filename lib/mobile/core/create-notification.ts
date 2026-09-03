// Mobile-only notification (work order) creation, used by Field Engineers from the PWA
// and React Native apps — the web admin keeps its own richer createWorkOrder(). A
// mobile-created notification is auto-assigned to its creator and, when the creator is a
// Field Engineer, starts with expense_approval = 'pending': expenses can't be logged
// against it until a Service Manager / Head of Service approves it on the web (see
// submitExpenseLogCore's gate). Also includes a slim "quick add customer" used by the
// same form when the site isn't in the system yet, mirroring the web addCustomer()
// customer -> site -> (optional) transformer -> contact insert sequence.
import { type AdminClient } from './shared'
import { logActivity } from '@/lib/activity-log'
import { notifyUsers } from '@/lib/notifications'

export const MOBILE_JOB_TYPES = [
  'site_inspection', 'amc', 'commissioning_activities', 'supervision',
  'overhauling', 'complaint', 'installation', 'testing', 'business_opportunity',
] as const

function todayDatePrefix(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}${mm}${dd}`
}

// Mirrors nextTicketNumber() in app/actions/create-work-order.ts — highest existing N for
// today's YYYYMMDD prefix, +1 (robust to a failed prior attempt). Duplicated rather than
// imported: that lives in a 'use server' file which can't be pulled into a REST route.
async function nextTicketNumber(admin: AdminClient): Promise<string> {
  const prefix = todayDatePrefix()
  const { data } = await admin.from('work_orders').select('ticket_number').like('ticket_number', `${prefix}-%`)
  let max = 0
  for (const row of data || []) {
    const n = parseInt((row.ticket_number || '').split('-')[1] || '0', 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `${prefix}-${max + 1}`
}

export interface MobileCustomerOption { id: string; name: string }
export interface MobileTransformerOption { id: string; serialNumber: string }

export async function listCustomersForMobileCore(admin: AdminClient): Promise<{ customers: MobileCustomerOption[]; error: string | null }> {
  try {
    const { data, error } = await admin.from('customers').select('id, name').order('name')
    if (error) return { customers: [], error: error.message }
    return { customers: (data || []).map(c => ({ id: c.id as string, name: (c.name as string) || 'Unnamed' })), error: null }
  } catch (e: unknown) {
    return { customers: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function listTransformersForCustomerCore(admin: AdminClient, customerId: string): Promise<{ transformers: MobileTransformerOption[]; error: string | null }> {
  try {
    if (!customerId) return { transformers: [], error: null }
    const { data, error } = await admin.from('transformers').select('id, serial_number').eq('customer_id', customerId).order('serial_number')
    if (error) return { transformers: [], error: error.message }
    return { transformers: (data || []).map(t => ({ id: t.id as string, serialNumber: (t.serial_number as string) || '' })), error: null }
  } catch (e: unknown) {
    return { transformers: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Slim customer create for the field. Only the four DB-required customer columns (name,
// type, contact_person, phone) plus a UI-required 6-digit pincode are mandatory; site and
// transformer are optional and fall back the same way the web addCustomer() does.
export async function createCustomerMobileCore(admin: AdminClient, userId: string, params: {
  name: string
  contactPerson: string
  phone: string
  type: 'sold' | 'shipped' | 'both'
  pincode: string
  siteName?: string | null
  serialNumber?: string | null
}): Promise<{ error: string | null; id?: string }> {
  try {
    const name = params.name.trim()
    const contactPerson = params.contactPerson.trim()
    const phone = params.phone.trim()
    if (!name) return { error: 'Enter the customer name' }
    if (!contactPerson) return { error: 'Enter a contact person' }
    if (!phone) return { error: 'Enter a phone number' }
    if (!/^\d{6}$/.test(params.pincode.trim())) return { error: 'Enter a valid 6-digit pincode' }

    const { data: cust, error: ce } = await admin.from('customers').insert({
      name,
      type: params.type || 'both',
      contact_person: contactPerson,
      phone,
      pincode: params.pincode.trim(),
    }).select('id').single()
    if (ce) return { error: ce.message }

    // site_name / site_address are NOT NULL — fall back to the customer name / blank,
    // matching web addCustomer().
    const { data: site, error: se } = await admin.from('customer_sites').insert({
      customer_id: cust.id,
      site_name: (params.siteName || '').trim() || name,
      site_address: '',
    }).select('id').single()
    if (se) return { error: se.message }

    const serial = (params.serialNumber || '').trim()
    if (serial) {
      const { error: te } = await admin.from('transformers').insert({
        customer_id: cust.id,
        site_id: site.id,
        serial_number: serial,
        warranty_status: 'under_warranty',
      })
      if (te) return { error: te.message }
    }

    await admin.from('customer_contacts').insert({
      customer_id: cust.id,
      site_id: site.id,
      name: contactPerson,
      phone,
      is_primary: true,
    })

    const { data: actor } = await admin.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle()
    const actorName = actor ? `${actor.first_name} ${actor.last_name}` : 'Engineer'
    logActivity(admin, { actorId: userId, actorName, action: `Added customer ${name}`, entityType: 'customer', entityId: cust.id }).catch(() => {})

    return { error: null, id: cust.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function createWorkOrderMobileCore(admin: AdminClient, userId: string, params: {
  jobType: string
  customerId: string | null
  transformerIds: string[]
  notes: string | null
}): Promise<{ error: string | null; id?: string }> {
  try {
    if (!params.jobType || !(MOBILE_JOB_TYPES as readonly string[]).includes(params.jobType)) {
      return { error: 'Select a job type' }
    }

    // Creator role decides whether this needs manager approval before expenses: only a
    // Field Engineer's own notification is gated. A manager creating from mobile (rare)
    // behaves like a web-created one (expense_approval null = expenses allowed).
    const { data: creator } = await admin.from('profiles').select('first_name, last_name, role').eq('id', userId).maybeSingle()
    if (!creator) return { error: 'Profile not found' }
    const actorName = `${creator.first_name} ${creator.last_name}`
    const expenseApproval = creator.role === 'Field Engineer' ? 'pending' : null

    // Retry on the rare ticket_number unique-collision race (see web createWorkOrder).
    let wo: { id: string; wo_number: string } | null = null
    let insertError: { code?: string; message: string } | null = null
    for (let attempt = 0; attempt < 5 && !wo; attempt++) {
      const ticketNumber = await nextTicketNumber(admin)
      const { data, error } = await admin.from('work_orders').insert({
        wo_number: ticketNumber,
        ticket_number: ticketNumber,
        job_type: params.jobType,
        customer_id: params.customerId || null,
        engineer_id: userId, // auto-assigned to the creator
        status: 'assigned',
        notes: params.notes || null,
        created_by: userId,
        expense_approval: expenseApproval,
      }).select('id, wo_number').single()
      if (data) { wo = data; break }
      insertError = error
      if (error?.code !== '23505') break
    }
    if (!wo) return { error: insertError?.message || 'Could not create notification.' }

    if (params.transformerIds.length) {
      await admin.from('work_order_transformers').insert(
        params.transformerIds.map(tid => ({ work_order_id: wo!.id, transformer_id: tid }))
      )
    }

    await admin.from('work_order_activity').insert([
      { work_order_id: wo.id, action: `Notification created by ${actorName}`, actor_name: actorName },
      { work_order_id: wo.id, action: `Assigned to ${actorName}`, actor_name: actorName },
    ])
    logActivity(admin, { actorId: userId, actorName, action: `Created notification ${wo.wo_number} (mobile)`, entityType: 'work_order', entityId: wo.id }).catch(() => {})

    // Only a Field-Engineer-created notification needs a manager to unlock expenses —
    // notify the approver roles so they can act on it without hunting for it.
    if (expenseApproval === 'pending') {
      notifyUsers(admin, [{ role: 'Service Manager' }, { role: 'Head of Service' }, { role: 'Super Admin' }], {
        type: 'work_order_pending_approval',
        title: 'Notification needs approval',
        body: `${actorName} created notification ${wo.wo_number}. Approve it to allow expenses.`,
        entityType: 'work_order', entityId: wo.id, linkPath: '/work-orders',
      }).catch(() => {})
    }

    return { error: null, id: wo.id }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
