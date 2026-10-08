-- Cache the geocoded project coordinates on direct-customer notifications (no linked
-- customer/site to cache them on) so the Assign-engineer distance ranking geocodes the
-- typed-in address only once instead of on every notification open.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS place_label text;

NOTIFY pgrst, 'reload schema';
