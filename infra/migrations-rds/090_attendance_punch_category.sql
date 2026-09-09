-- Punch-in work category + visit details captured when a field engineer punches in.
-- Categories: travel_r (Travel, recoverable), travel_nr (Travel, non-recoverable),
-- site_r (Site, recoverable), site_nr (Site, non-recoverable), hq (head office).
-- HQ needs no visit details; the other four collect customer/site/purpose. No approval
-- — just recorded. The category drives the day's colour in the attendance views.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS punch_category text,
  ADD COLUMN IF NOT EXISTS visit_customer_name text,
  ADD COLUMN IF NOT EXISTS visit_site_address text,
  ADD COLUMN IF NOT EXISTS visit_purpose text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_punch_category_check'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_punch_category_check
      CHECK (punch_category IS NULL OR punch_category IN ('travel_r','travel_nr','site_r','site_nr','hq'));
  END IF;
END $$;
