-- WhatsApp channel for the field-engineer password-reset OTP (an alternative to the
-- Combirds SMS path in migration 103, useful while DLT SMS approval is pending). Reuses
-- the existing settings.whatsapp_api_key (Combirds WhatsApp Campaign API key) and adds
-- the campaign name of a pre-approved WhatsApp template whose single templateParam is the
-- 6-digit code. The OTP sender prefers SMS when fully configured, else falls back to this
-- WhatsApp campaign (see lib/messaging/otp.ts).
alter table public.settings add column if not exists whatsapp_campaign_password_otp text;
