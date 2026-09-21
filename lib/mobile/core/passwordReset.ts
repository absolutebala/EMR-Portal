import { createHash, randomInt, timingSafeEqual } from 'crypto'
import type { AdminClient } from './shared'
import { sendPasswordResetOtp } from '@/lib/messaging/otp'
import { adminSetPermanentPassword } from '@/lib/cognito/admin-reset-password'

// Field-engineer self-service password reset by SMS OTP. Flow:
//   1) request: engineer types their registered mobile number → we find the matching
//      Field Engineer, generate a 6-digit OTP, store only its hash (10-min expiry), and
//      text it via Combirds SMS.
//   2) verify: engineer enters the OTP + a new password → we check the hash and set the
//      new Cognito password (permanent, no force-change).
//
// Anti-enumeration: `request` always reports success regardless of whether the number
// matched an account, so the login screen can't be used to discover who has an app login.
// `verify` returns only generic "invalid or expired code" errors for the same reason.

const OTP_TTL_MS = 10 * 60 * 1000       // codes live 10 minutes
const MAX_ATTEMPTS = 5                  // wrong guesses before a code is burned
const RESEND_COOLDOWN_MS = 60 * 1000    // min gap between sends to one engineer
const MAX_SENDS_PER_HOUR = 5            // hard cap per engineer per rolling hour

// Match on the last 10 digits so "+91 98765 43210", "098765-43210" and "9876543210" all
// resolve to the same engineer regardless of how the number was stored/typed.
function last10(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10)
}

function hashOtp(otp: string, userId: string): string {
  return createHash('sha256').update(`${otp}:${userId}`).digest('hex')
}

function otpMatches(otp: string, userId: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(otp, userId))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Cognito password policy (infra/lib/auth-stack.ts): min 8, upper, lower, digit, symbol.
export function validatePasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.'
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.'
  if (!/[0-9]/.test(pw)) return 'Password must include a number.'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a symbol.'
  return null
}

// Resolve the single Field Engineer whose registered phone ends in the same 10 digits as
// the typed identifier. Returns null when zero or more than one match (ambiguous → treat
// as "no account" so we never text the wrong person).
async function findEngineerByPhone(admin: AdminClient, identifier: string): Promise<{ id: string; email: string; phone: string; name: string } | null> {
  const target = last10(identifier)
  if (target.length !== 10) return null
  const { data } = await admin.from('profiles')
    .select('id, email, phone, first_name, last_name')
    .eq('role', 'Field Engineer')
    .not('phone', 'is', null)
  const rows = (data ?? []) as { id: string; email: string | null; phone: string | null; first_name: string | null; last_name: string | null }[]
  const matches = rows.filter(r => r.phone && last10(r.phone) === target && r.email)
  if (matches.length !== 1) return null
  const m = matches[0]
  return { id: m.id, email: m.email as string, phone: m.phone as string, name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Engineer' }
}

export async function requestPasswordResetOtpCore(
  admin: AdminClient,
  params: { identifier: string }
): Promise<{ ok: true }> {
  try {
    const eng = await findEngineerByPhone(admin, params.identifier ?? '')
    if (!eng) return { ok: true } // anti-enumeration: pretend success

    // Rate limit: no send within the cooldown, and no more than N in the last hour.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recent } = await admin.from('password_reset_otps')
      .select('created_at')
      .eq('user_id', eng.id)
      .gte('created_at', hourAgo)
      .order('created_at', { ascending: false })
    const recentRows = (recent ?? []) as { created_at: string }[]
    if (recentRows.length >= MAX_SENDS_PER_HOUR) return { ok: true }
    if (recentRows[0] && Date.now() - new Date(recentRows[0].created_at).getTime() < RESEND_COOLDOWN_MS) return { ok: true }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await admin.from('password_reset_otps').insert({
      user_id: eng.id,
      phone: eng.phone,
      otp_hash: hashOtp(otp, eng.id),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })

    await sendPasswordResetOtp(admin, { phone: eng.phone, otp, name: eng.name }).catch(() => false)
    return { ok: true }
  } catch (e) {
    console.error('requestPasswordResetOtpCore failed', e instanceof Error ? e.message : e)
    return { ok: true }
  }
}

export async function verifyPasswordResetOtpCore(
  admin: AdminClient,
  params: { identifier: string; otp: string; newPassword: string }
): Promise<{ error: string | null }> {
  const otp = (params.otp ?? '').trim()
  const newPassword = params.newPassword ?? ''

  const policyError = validatePasswordPolicy(newPassword)
  if (policyError) return { error: policyError }
  if (!/^\d{6}$/.test(otp)) return { error: 'Enter the 6-digit code from the SMS.' }

  const eng = await findEngineerByPhone(admin, params.identifier ?? '')
  if (!eng) return { error: 'Invalid or expired code.' }

  const { data: row } = await admin.from('password_reset_otps')
    .select('id, otp_hash, expires_at, attempts, consumed_at')
    .eq('user_id', eng.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const otpRow = row as { id: string; otp_hash: string; expires_at: string; attempts: number; consumed_at: string | null } | null

  if (!otpRow || new Date(otpRow.expires_at).getTime() < Date.now()) return { error: 'Invalid or expired code.' }
  if (otpRow.attempts >= MAX_ATTEMPTS) return { error: 'Too many attempts. Request a new code.' }

  if (!otpMatches(otp, eng.id, otpRow.otp_hash)) {
    await admin.from('password_reset_otps').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id)
    return { error: 'Invalid or expired code.' }
  }

  const result = await adminSetPermanentPassword(eng.email, newPassword)
  if (result.error) return { error: result.error }

  await admin.from('password_reset_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otpRow.id)
  return { error: null }
}
