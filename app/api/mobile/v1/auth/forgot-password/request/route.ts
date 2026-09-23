import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/mobile/core/shared'
import { requestPasswordResetOtpCore } from '@/lib/mobile/core/passwordReset'

// Public (pre-login): a field engineer requests a password-reset OTP by their registered
// mobile number. Returns { found } — the client shows "not registered" when found:false
// (anti-enumeration intentionally dropped for a clearer UX). No bearer auth by design.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { identifier } = (body ?? {}) as { identifier?: string }
  const result = await requestPasswordResetOtpCore(adminClient(), { identifier: identifier ?? '' })
  return NextResponse.json(result)
}
