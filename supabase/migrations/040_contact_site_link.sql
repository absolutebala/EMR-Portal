-- A customer can have multiple sites, and each site can have its own on-site
-- contact(s), distinct from a general/head-office contact. Nullable — a contact not
-- tied to any specific site stays a general customer-level contact as before.
ALTER TABLE public.customer_contacts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.customer_sites(id) ON DELETE SET NULL;
