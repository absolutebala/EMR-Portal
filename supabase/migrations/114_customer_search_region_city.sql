-- OLTC (SAP customer master) bulk upload carries SearchTerm, Rg (region) and City as
-- first-class attributes, not just address text — give them their own columns.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS search_term text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;
