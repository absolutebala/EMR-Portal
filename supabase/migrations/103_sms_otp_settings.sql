-- Combirds SMS config for the field-engineer password-reset OTP (lib/messaging/sms.ts).
-- Reuses the existing settings.sms_api_key (x-api-key) and settings.sms_sender_id
-- (DLT sender header) columns from 001_initial_schema.sql, and adds the two extra
-- fields the Combirds SMS API requires plus the DLT-approved template text.
--
--   sms_template_id  — DLT-approved template ID matching the OTP message text
--   sms_type         — Combirds billing-approved smsType for that template
--   sms_otp_template — the exact DLT-approved message text, with the literal token
--                      {otp} where the 6-digit code is substituted at send time.
alter table public.settings add column if not exists sms_template_id text;
alter table public.settings add column if not exists sms_type text;
alter table public.settings add column if not exists sms_otp_template text;
