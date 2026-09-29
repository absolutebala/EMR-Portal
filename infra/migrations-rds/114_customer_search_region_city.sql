-- OLTC (SAP customer master) bulk upload carries SearchTerm, Rg (region) and City as
-- first-class attributes, not just address text — give them their own columns so they
-- can be shown/edited/searched on the customer record instead of being folded into the
-- address or notes.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS search_term text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;

NOTIFY pgrst, 'reload schema';
