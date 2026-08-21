-- Adds "OEM" as a third top-level End User Type on the notification creation form,
-- alongside the existing Utility/Industry toggle (work_orders.customer_type). This is
-- a distinct concept from customers.end_customer_type_id's "End Customer Type"
-- catalog (also seeded with an "OEM" entry in migration 065) — that field is a
-- per-customer classification on the customer form; this one is a per-notification
-- classification on the notification form. Both happen to use the word "OEM" but are
-- unrelated fields on unrelated forms.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.work_orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%customer_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.work_orders DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_customer_type_check
  CHECK (customer_type IN ('utility', 'industry', 'oem'));

-- Widen customer_categories.customer_type too, so the same searchable/creatable
-- sub-category picker (CustomerCategoryPicker) works under an 'oem' bucket exactly
-- like it already does for 'utility'/'industry'/'end_customer_type'.
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
  CHECK (customer_type IN ('utility', 'industry', 'end_customer_type', 'oem'));
