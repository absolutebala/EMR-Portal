import type { adminClient } from '@/lib/db/admin-client'
import { sendCombirdsMessage, sendCombirdsSms } from './combirds'

// Event -> Combirds "campaign" (a pre-approved WhatsApp Business template) contract.
// Combirds campaigns are template-based: this app can't create them, it can only
// define a fixed param order and let the admin build a matching template in their own
// Combirds dashboard, then enter that campaign's name in Settings. templateParams below
// is the single source of truth for that order — keep it in sync with the Settings UI
// helper text (app/(app)/settings/SettingsPageClient.tsx).
//
//   assigned_engineer (5): 1) engineer first name, 2) WO number, 3) customer name,
//                          4) transformer serial number(s) (comma-joined if more than
//                          one), 5) scheduled date ("DD MMM YYYY" or "Not scheduled")
//   assigned_customer (3): 1) engineer full name, 2) scheduled date ("DD MMM YYYY" or
//                          "Not scheduled"), 3) engineer phone number (so the customer
//                          can reach the engineer directly)
//   reassigned_customer (3): same 3 params as assigned_customer — sent to the customer
//                          instead of assigned_customer when the engineer on an existing
//                          notification is changed, so the wording can say a *different*
//                          engineer is now attending.
//   on_the_way        (4): 1) customer contact person, 2) engineer full name,
//                          3) WO number, 4) start-by time ("HH:mm" or "")
//   product_request    (4): 1) engineer first name, 2) WO number, 3) status label,
//                          4) product name
//   escalation         (4): 1) WO number, 2) engineer full name, 3) transformer serial
//                          number(s), 4) reason (recipient's own name comes from the
//                          top-level `userName` field, not a templateParam, since it
//                          varies per recipient in a broadcast and templateParams is
//                          shared across all of them)
//   completed          (4): 1) customer contact person, 2) WO number, 3) engineer full
//                          name, 4) completion date ("DD MMM YYYY")
//   pending            (4): 1) customer contact person, 2) WO number, 3) engineer full
//                          name, 4) follow-up/revisit date ("DD MMM YYYY" or "")
//   expense_reminder    (2): 1) engineer full name, 2) count of expenses awaiting their
//                          approval (recipient's own name comes from `userName`, same as
//                          escalation)
//   dispatched_customer (3): 1) customer contact person, 2) WO number, 3) docket number
//                          (or "-" when none was entered) — sent when an admin/Service
//                          Manager marks a product request item dispatched.
export type WhatsAppEvent =
  | 'assigned_engineer' | 'assigned_customer' | 'reassigned_customer' | 'on_the_way' | 'product_request' | 'escalation'
  | 'completed' | 'pending' | 'expense_reminder' | 'dispatched_customer'

const CAMPAIGN_COLUMN: Record<WhatsAppEvent, string> = {
  assigned_engineer: 'whatsapp_campaign_assigned_engineer',
  assigned_customer: 'whatsapp_campaign_assigned_customer',
  reassigned_customer: 'whatsapp_campaign_reassigned_customer',
  on_the_way: 'whatsapp_campaign_on_the_way',
  product_request: 'whatsapp_campaign_product_request',
  escalation: 'whatsapp_campaign_escalation',
  completed: 'whatsapp_campaign_completed',
  pending: 'whatsapp_campaign_pending',
  expense_reminder: 'whatsapp_campaign_expense_reminder',
  dispatched_customer: 'whatsapp_campaign_dispatched_customer',
}

function formatPhoneForWhatsApp(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`
  if (/^91\d{10}$/.test(stripped)) return `+${stripped}`
  return `+${stripped}`
}

// Combirds SMS wants the number with country code and no leading "+" (e.g. 919876543210).
function formatPhoneForSms(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

// Substitute {1} {2} … placeholders in a DLT SMS template with the same ordered params
// the WhatsApp campaign uses (see templateParams). Unmatched placeholders resolve to ''.
function fillSmsTemplate(text: string, params: string[]): string {
  return text.replace(/\{(\d+)\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

// Fire-and-forget notification send for one app event, to one or more recipients. Never
// throws. The org-wide `notification_channel` setting picks the transport:
//   'whatsapp' (default) — WhatsApp only, exactly as before.
//   'sms'                — SMS for events whose DLT template is configured; any event
//                          without one falls back to WhatsApp.
//   'both'               — WhatsApp AND SMS (SMS only where its template is configured).
// Each channel silently no-ops if its own credentials/template for the event aren't set.
export async function sendWhatsApp(
  admin: ReturnType<typeof adminClient>,
  event: WhatsAppEvent,
  recipients: { phone: string | null | undefined; userName: string }[],
  templateParams: string[]
): Promise<void> {
  try {
    const column = CAMPAIGN_COLUMN[event]
    const selectCols = `whatsapp_api_key, ${column}, notification_channel, sms_api_key, sms_sender_id, sms_notification_type, sms_notification_templates`
    const { data: settings } = await admin.from('settings').select(selectCols).single()
    const row = settings as Record<string, unknown> | null
    if (!row) return

    const channel = (row.notification_channel as string) || 'whatsapp'
    const waApiKey = row.whatsapp_api_key as string | null
    const campaignName = row[column] as string | null

    const smsApiKey = row.sms_api_key as string | null
    const smsSender = row.sms_sender_id as string | null
    const smsType = row.sms_notification_type as string | null
    const templates = (row.sms_notification_templates as Record<string, { id?: string; text?: string }> | null) || {}
    const t = templates[event] || {}
    const smsConfigured = !!(smsApiKey && smsSender && smsType && t.id && t.text)

    const sendSms = (channel === 'sms' || channel === 'both') && smsConfigured
    // WhatsApp fires for 'whatsapp'/'both', or as the fallback when 'sms' is chosen but
    // this event has no SMS template configured yet.
    const sendWa = channel === 'whatsapp' || channel === 'both' || (channel === 'sms' && !smsConfigured)

    const targets = recipients.filter(r => r.phone && r.phone.trim())
    const jobs: Promise<boolean>[] = []

    if (sendWa && waApiKey && campaignName) {
      for (const r of targets) {
        jobs.push(sendCombirdsMessage({
          apiKey: waApiKey,
          campaignName,
          destination: formatPhoneForWhatsApp(r.phone as string),
          userName: r.userName,
          templateParams,
          source: 'emr-portal',
        }).catch(() => false))
      }
    }

    if (sendSms) {
      const message = fillSmsTemplate(t.text as string, templateParams)
      for (const r of targets) {
        jobs.push(sendCombirdsSms({
          apiKey: smsApiKey as string,
          senderId: smsSender as string,
          templateId: t.id as string,
          smsType: smsType as string,
          message,
          destination: formatPhoneForSms(r.phone as string),
        }).catch(() => false))
      }
    }

    await Promise.all(jobs)
  } catch {
    // best-effort only
  }
}
