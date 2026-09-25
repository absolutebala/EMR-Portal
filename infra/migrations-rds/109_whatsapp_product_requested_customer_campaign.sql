-- Dedicated WhatsApp campaign for the customer reassurance message sent when a field
-- engineer submits a product/material request after inspecting the site. Fixed text,
-- no template variables.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_campaign_product_requested_customer TEXT;

-- Reload PostgREST's schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
