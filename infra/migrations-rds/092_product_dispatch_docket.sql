-- Dispatch docket: when an admin/Service Manager marks a product request item as
-- dispatched they upload a docket (PDF/image) and optionally a docket/tracking number.
-- Stored at the request level (one shipment doc per request) and shown to the engineer
-- in the mobile app. Plus a new WhatsApp campaign so the customer is told the material
-- has been dispatched.
ALTER TABLE public.product_requests
  ADD COLUMN IF NOT EXISTS docket_url text,
  ADD COLUMN IF NOT EXISTS docket_number text,
  ADD COLUMN IF NOT EXISTS docket_uploaded_at timestamptz;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS whatsapp_campaign_dispatched_customer text;
