// Transactional SMS transport (Combirds SMS API, https://api.combirds.com). Currently
// used only for the field-engineer password-reset OTP (lib/mobile/core/passwordReset.ts).
// Never throws — an SMS failure must not break the calling action (mirrors combirds.ts).
//
// Config lives in the `settings` row (edited under Settings → SMS OTP in the portal):
//   sms_api_key      → x-api-key header
//   sms_sender_id    → DLT-approved 6-char sender header (senderId)
//   sms_template_id  → DLT-approved template ID (templateId)
//   sms_type         → Combirds billing-approved smsType for that template
//   sms_otp_template → the exact DLT-approved message text, with the literal token {otp}
//                      where the 6-digit code goes. India TRAI/DLT requires the sent text
//                      to match the registered template exactly.
// Any of these missing → silent no-op (OTP generated/stored but not texted).
import type { adminClient } from '@/lib/db/admin-client'

const COMBIRDS_SMS_ENDPOINT = 'https://api.combirds.com/api/v1/sms/send'
const OTP_TOKEN = '{otp}'

// Combirds expects the number without a leading "+", country code included, e.g.
// "919876543210". Normalize any stored/typed format to that.
function formatForCombirds(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits // already has a country code (e.g. 91XXXXXXXXXX)
}

export async function sendPasswordResetSms(
  admin: ReturnType<typeof adminClient>,
  phone: string,
  otp: string
): Promise<boolean> {
  let apiKey: string | null | undefined
  let senderId: string | null | undefined
  let templateId: string | null | undefined
  let smsType: string | null | undefined
  let template: string | null | undefined
  try {
    const { data } = await admin.from('settings')
      .select('sms_api_key, sms_sender_id, sms_template_id, sms_type, sms_otp_template')
      .single()
    const row = data as Record<string, string | null> | null
    apiKey = row?.sms_api_key
    senderId = row?.sms_sender_id
    templateId = row?.sms_template_id
    smsType = row?.sms_type
    template = row?.sms_otp_template
  } catch {
    return false
  }

  if (!apiKey || !senderId || !templateId || !smsType || !template) {
    console.warn('sendPasswordResetSms: SMS OTP not fully configured in Settings — OTP generated but not texted')
    return false
  }

  const message = template.includes(OTP_TOKEN) ? template.split(OTP_TOKEN).join(otp) : `${template} ${otp}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(COMBIRDS_SMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        message,
        senderId,
        number: [formatForCombirds(phone)],
        templateId,
        smsType,
      }),
    })
    if (!res.ok) {
      console.error('sendPasswordResetSms: non-200', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('sendPasswordResetSms: failed', e instanceof Error ? e.message : e)
    return false
  } finally {
    clearTimeout(timeout)
  }
}
