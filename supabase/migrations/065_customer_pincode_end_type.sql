-- Adds a mandatory Pincode field and a new "End Customer Type" (OEM, Solar, etc.) to
-- the customer creation form. End Customer Type reuses the customer_categories catalog
-- introduced in 041 (same searchable/creatable-dropdown UX already used for the
-- notification form's Utility/Industry categories) under a new bucket, rather than a
-- separate table.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS end_customer_type_id UUID REFERENCES public.customer_categories(id) ON DELETE SET NULL;

-- Widen customer_categories.customer_type's CHECK constraint to allow the new bucket.
-- Looked up by definition rather than a guessed/hardcoded name since it was originally
-- declared inline (no explicit CONSTRAINT name) in migration 041.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.customer_categories'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%customer_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customer_categories DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.customer_categories ADD CONSTRAINT customer_categories_customer_type_check
  CHECK (customer_type IN ('utility', 'industry', 'end_customer_type'));

INSERT INTO public.customer_categories (customer_type, name) VALUES
  ('end_customer_type', 'OEM'),
  ('end_customer_type', 'Solar')
ON CONFLICT (customer_type, name) DO NOTHING;
