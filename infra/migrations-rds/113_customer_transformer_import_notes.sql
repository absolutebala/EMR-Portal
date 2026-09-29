-- Department bulk imports (OLTC customer master, NIPS transformer register) carry
-- SAP order metadata we want to keep for traceability but have no dedicated column
-- for: OLTC's SearchTerm, and NIPS's Sales Doc / ODN No / Purchase Order / Your
-- Reference / Invoice Qty / Employee / Material code. Capture them in a free-text
-- notes column on each table rather than dropping them.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.transformers ADD COLUMN IF NOT EXISTS notes text;

-- Reload PostgREST's schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
