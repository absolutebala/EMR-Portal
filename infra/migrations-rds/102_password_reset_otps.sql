-- Self-service password reset for field engineers on the mobile app. The engineer
-- enters their registered mobile number on the login screen; the backend generates a
-- 6-digit OTP, stores only its hash here (never the raw code), texts the code via SMS
-- (Combirds), and — once the engineer enters the code + a new password — sets that
-- password in Cognito. See lib/mobile/core/passwordReset.ts.
--
-- Only the hash is stored, salted per-user, so a DB leak can't reveal live OTPs. Rows
-- are short-lived (10-minute expiry) and single-use (consumed_at). Rate limiting is
-- enforced on read by counting recent rows per user (1 send / 60s, max 5 / hour).
create table public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The phone the OTP was texted to (as normalized at request time), for auditing.
  phone text not null,
  -- sha256(otp + ':' + user_id) — the raw OTP is never persisted.
  otp_hash text not null,
  expires_at timestamptz not null,
  -- Wrong-code guesses; the row is burned once this crosses the max (5).
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_otps_user_idx on public.password_reset_otps (user_id, created_at desc);
