-- Make every notification event (assigned, on-the-way, completed, …) deliverable by SMS
-- as well as WhatsApp, via one global channel switch. See lib/messaging/whatsapp.ts.
--
--   notification_channel      'whatsapp' (default, unchanged behavior) | 'sms' | 'both'.
--                             'sms' falls back to WhatsApp for any event whose SMS
--                             template isn't configured; 'both' sends on both channels.
--   sms_notification_type     shared Combirds billing-approved smsType for all
--                             notification SMS (reuses settings.sms_api_key + sms_sender_id).
--   sms_notification_templates  JSON map of WhatsApp event key -> { id, text }, where id is
--                             the DLT-approved template ID and text is the message with
--                             {1} {2} … placeholders in the SAME param order as that event's
--                             WhatsApp campaign (documented in lib/messaging/whatsapp.ts).
alter table public.settings add column if not exists notification_channel text not null default 'whatsapp'
  check (notification_channel in ('whatsapp', 'sms', 'both'));
alter table public.settings add column if not exists sms_notification_type text;
alter table public.settings add column if not exists sms_notification_templates jsonb not null default '{}'::jsonb;
