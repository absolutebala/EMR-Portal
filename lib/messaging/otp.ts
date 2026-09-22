// Channel-smart delivery for the field-engineer password-reset OTP. Prefers SMS when the
// Combirds SMS settings are fully filled in (migration 103), otherwise falls back to a
// pre-approved WhatsApp template (migration 104) — so the org can go live on WhatsApp now
// and auto-switch to SMS the moment DLT approval lands and the SMS fields are set, with no
// code change. Never throws (best-effort; the reset flow reports success regardless).
import type { adminClient } from '@/lib/db/admin-client'
import { sendPasswordResetSms } from './sms'
import { sendCombirdsMessage } from './combirds'

// Match whatsapp.ts's formatPhoneForWhatsApp exactly (the proven-working format for the
// Combirds WhatsApp Campaign API): E.164 with a leading "+", defaulting to +91 for bare
// 10-digit Indian numbers.
function formatForWhatsApp(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`
  if (/^91\d{10}$/.test(stripped)) return `+${stripped}`
  return `+${stripped}`
}

export async function sendPasswordResetOtp(
  admin: ReturnType<typeof adminClient>,
  params: { phone: string; otp: string; name: string }
): Promise<boolean> {
  let row: Record<string, string | null> | null = null
  try {
    const { data } = await admin.from('settings')
      .select('sms_api_key, sms_sender_id, sms_template_id, sms_type, sms_otp_template, whatsapp_api_key, whatsapp_campaign_password_otp')
      .single()
    row = data as Record<string, string | null> | null
  } catch {
    return false
  }

  const smsReady = !!(row?.sms_api_key && row?.sms_sender_id && row?.sms_template_id && row?.sms_type && row?.sms_otp_template)
  if (smsReady) return sendPasswordResetSms(admin, params.phone, params.otp)

  const waKey = row?.whatsapp_api_key
  const waCampaign = row?.whatsapp_campaign_password_otp
  if (waKey && waCampaign) {
    return sendCombirdsMessage({
      apiKey: waKey,
      campaignName: waCampaign,
      destination: formatForWhatsApp(params.phone),
      userName: params.name,
      templateParams: [params.otp],
      source: 'emr-portal',
    }).catch(() => false)
  }

  console.warn('sendPasswordResetOtp: no OTP channel configured (neither SMS nor WhatsApp)')
  return false
}
