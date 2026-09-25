-- Dedicated WhatsApp campaign for the reassignment-to-customer notification, so a
-- reassignment (engineer changed on an existing notification) can use different wording
-- ("a different engineer has now been assigned") than a first-time assignment.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_campaign_reassigned_customer TEXT;

-- Reload PostgREST's schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
