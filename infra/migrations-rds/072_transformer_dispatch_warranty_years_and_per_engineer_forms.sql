-- Two independent schema tweaks bundled in one migration:
--
-- 1. Dispatch Date + Warranty Years on transformers — new fields alongside the
--    existing rating/manufacturer/year_of_manufacture/warranty_status.
ALTER TABLE public.transformers ADD COLUMN dispatch_date DATE;
ALTER TABLE public.transformers ADD COLUMN warranty_years INTEGER;

-- 2. form_submissions used to be one row per (work_order_id, form_id), shared by
--    whichever engineer submitted last — a second engineer filling the form (via
--    handover or multi-engineer assignment) silently overwrote the first
--    engineer's answers. Widen to one row per engineer per form per notification,
--    mirroring how work_order_checkins/work_order_daily_closures already carry
--    their own engineer_id per row.
ALTER TABLE public.form_submissions DROP CONSTRAINT form_submissions_wo_form_unique;
ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_wo_form_engineer_unique UNIQUE (work_order_id, form_id, submitted_by);
