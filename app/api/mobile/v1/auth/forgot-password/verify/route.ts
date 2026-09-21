import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/mobile/core/shared'
import { verifyPasswordResetOtpCore } from '@/lib/mobile/core/passwordReset'

// Public (pre-login): verify the OTP a field engineer received and set their new
// password. No bearer auth by design — proof of identity is the OTP itself.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { identifier, otp, newPassword } = (body ?? {}) as { identifier?: string; otp?: string; newPassword?: string }
  const result = await verifyPasswordResetOtpCore(adminClient(), {
    identifier: identifier ?? '',
    otp: otp ?? '',
    newPassword: newPassword ?? '',
  })
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
