-- Combirds WhatsApp campaign names per app event. whatsapp_api_key (added in
-- 001_initial_schema.sql) is reused as-is for the Combirds API key. Each campaign
-- must already exist and be "Live" in the org's own Combirds dashboard, built to
-- accept templateParams in the fixed order documented in lib/messaging/whatsapp.ts
-- for that event. Blank/null = that event's WhatsApp send is silently skipped
-- (feature not yet configured for that event).
alter table public.settings add column if not exists whatsapp_campaign_assigned_engineer text;
alter table public.settings add column if not exists whatsapp_campaign_assigned_customer text;
alter table public.settings add column if not exists whatsapp_campaign_on_the_way text;
alter table public.settings add column if not exists whatsapp_campaign_product_request text;
alter table public.settings add column if not exists whatsapp_campaign_escalation text;
alter table public.settings add column if not exists whatsapp_campaign_completed text;
alter table public.settings add column if not exists whatsapp_campaign_pending text;
