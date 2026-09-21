// Transactional SMS transport (Combirds). Currently used only for the field-engineer
// password-reset OTP (lib/mobile/core/passwordReset.ts). Never throws — an SMS failure
// must not break the calling action (mirrors combirds.ts / notifications.ts).
//
// ── NOT YET WIRED ──────────────────────────────────────────────────────────────────
// The Combirds SMS product is separate from the WhatsApp Campaign API in combirds.ts
// (different base URL + DLT template/sender-ID params for India). Fill in ENDPOINT and
// the request body below once the Combirds SMS API details are in hand, and add the
// matching settings columns (sms_api_key, sms_otp_template_id, sms_sender_id) via a
// migration. Until then this returns false (not configured) and the OTP is generated +
// stored but not delivered — the reset flow still runs end to end, it just can't text.
import type { adminClient } from '@/lib/db/admin-client'

// TODO(sms): real Combirds SMS endpoint.
const COMBIRDS_SMS_ENDPOINT = ''

function normalizeForSms(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, '')
  if (stripped.startsWith('+')) return stripped
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`
  if (/^91\d{10}$/.test(stripped)) return `+${stripped}`
  return `+${stripped}`
}

// Sends the password-reset OTP to `phone`. Returns whether the SMS was actually
// dispatched (false when SMS isn't configured yet, or on any transport failure).
export async function sendPasswordResetSms(
  _admin: ReturnType<typeof adminClient>,
  phone: string,
  otp: string
): Promise<boolean> {
  if (!COMBIRDS_SMS_ENDPOINT) {
    console.warn('sendPasswordResetSms: SMS transport not configured yet — OTP generated but not texted')
    return false
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    // TODO(sms): shape the body to the Combirds SMS API (apiKey, templateId, senderId,
    // destination, the OTP variable). Mirrors sendCombirdsMessage in combirds.ts.
    const res = await fetch(COMBIRDS_SMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ destination: normalizeForSms(phone), otp }),
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
