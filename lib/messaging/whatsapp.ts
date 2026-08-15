import type { adminClient } from '@/lib/db/admin-client'
import { sendCombirdsMessage } from './combirds'

// Event -> Combirds "campaign" (a pre-approved WhatsApp Business template) contract.
// Combirds campaigns are template-based: this app can't create them, it can only
// define a fixed param order and let the admin build a matching template in their own
// Combirds dashboard, then enter that campaign's name in Settings. templateParams below
// is the single source of truth for that order — keep it in sync with the Settings UI
// helper text (app/(app)/settings/SettingsPageClient.tsx).
//
//   assigned_engineer (4): 1) engineer first name, 2) WO number, 3) customer name,
//                          4) scheduled date ("DD MMM YYYY" or "Not scheduled")
//   assigned_customer (4): 1) customer contact person, 2) WO number, 3) engineer full
//                          name, 4) scheduled date
//   on_the_way        (4): 1) customer contact person, 2) engineer full name,
//                          3) WO number, 4) start-by time ("HH:mm" or "")
//   product_request    (4): 1) engineer first name, 2) WO number, 3) status label,
//                          4) product name
//   escalation         (3): 1) WO number, 2) engineer full name, 3) reason
//                          (recipient's own name comes from the top-level `userName`
//                          field, not a templateParam, since it varies per recipient
//                          in a broadcast and templateParams is shared across all of them)
//   completed          (4): 1) customer contact person, 2) WO number, 3) engineer full
//                          name, 4) completion date ("DD MMM YYYY")
//   pending            (4): 1) customer contact person, 2) WO number, 3) engineer full
//                          name, 4) follow-up/revisit date ("DD MMM YYYY" or "")
export type WhatsAppEvent =
  | 'assigned_engineer' | 'assigned_customer' | 'on_the_way' | 'product_request' | 'escalation'
  | 'completed' | 'pending'

const CAMPAIGN_COLUMN: Record<WhatsAppEvent, string> = {
  assigned_engineer: 'whatsapp_campaign_assigned_engineer',
  assigned_customer: 'whatsapp_campaign_assigned_customer',
  on_the_way: 'whatsapp_campaign_on_the_way',
  product_request: 'whatsapp_campaign_product_request',
  escalation: 'whatsapp_campaign_escalation',
  completed: 'whatsapp_campaign_completed',
  pending: 'whatsapp_campaign_pending',
}

function formatPhoneForWhatsApp(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`
  if (/^91\d{10}$/.test(stripped)) return `+${stripped}`
  return `+${stripped}`
}

// Fire-and-forget WhatsApp send for one app event, to one or more recipients. Never
// throws. Silently no-ops if the Combirds API key or that event's campaign name isn't
// configured yet in Settings — WhatsApp is opt-in per event, not a hard requirement.
export async function sendWhatsApp(
  admin: ReturnType<typeof adminClient>,
  event: WhatsAppEvent,
  recipients: { phone: string | null | undefined; userName: string }[],
  templateParams: string[]
): Promise<void> {
  try {
    const column = CAMPAIGN_COLUMN[event]
    const selectCols: string = `whatsapp_api_key, ${column}`
    const { data: settings } = await admin.from('settings').select(selectCols).single()
    const row = settings as Record<string, string | null> | null
    const apiKey = row?.whatsapp_api_key
    const campaignName = row?.[column]
    if (!apiKey || !campaignName) return

    await Promise.all(
      recipients
        .filter(r => r.phone && r.phone.trim())
        .map(r =>
          sendCombirdsMessage({
            apiKey,
            campaignName,
            destination: formatPhoneForWhatsApp(r.phone as string),
            userName: r.userName,
            templateParams,
            source: 'emr-portal',
          }).catch(() => false)
        )
    )
  } catch {
    // best-effort only
  }
}
