-- Overhauling-type notifications can be created without a customer/serial number
-- picked yet (all fields optional for that job type) — customer_id was previously
-- NOT NULL, which made that impossible. ON DELETE RESTRICT is unaffected; a null
-- customer_id just means "not linked to a customer yet."
ALTER TABLE public.work_orders
  ALTER COLUMN customer_id DROP NOT NULL;
