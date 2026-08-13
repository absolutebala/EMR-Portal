-- Visit sign-off (engineer + client signature) moves from form submission to
-- end-of-day closure — it's the closure decision (day done vs. still pending) that
-- should be signed off, not every intermediate form save.
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS engineer_signature TEXT;
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS client_signature TEXT;
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS sent_to_sap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS sent_to_sap_at TIMESTAMPTZ;

-- A pending closure can flag that the job needs a different engineer entirely,
-- rather than just waiting on the same one.
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS needs_reassignment BOOLEAN NOT NULL DEFAULT false;

-- New real status: distinct from 'pending' so it can be filtered/reported on directly.
-- Underlying column is plain text with an inline CHECK (not an enum type), so this is
-- just a constraint swap.
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check
  CHECK (status IN ('unassigned', 'assigned', 'in_progress', 'pending', 'completed', 'needs_reassignment'));
