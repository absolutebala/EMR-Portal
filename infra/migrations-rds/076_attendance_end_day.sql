-- "End Day" — a separate end-of-day sign-off from attendance marking, distinct from
-- the app's own session Sign Out. Captured once per day, only after the morning
-- Present has already been marked, with its own timestamp + GPS location.
ALTER TABLE public.attendance
  ADD COLUMN end_day_at TIMESTAMPTZ,
  ADD COLUMN end_day_latitude NUMERIC,
  ADD COLUMN end_day_longitude NUMERIC,
  ADD COLUMN end_day_place_name TEXT;
