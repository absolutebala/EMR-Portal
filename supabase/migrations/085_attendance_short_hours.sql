-- Attendance rewrite: the day is Present only when the engineer punched in by 10:00
-- IST, punched out, and worked >= 6h gross. A shortfall (< 6h) is a new Absent cause,
-- tracked with this flag (mirrors late_in / single_punch). The older early_out flag is
-- no longer written (8:45h / Early Out / End-Day-unlock rules are dropped) but the
-- column is left in place so historical rows keep their data.
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS short_hours boolean NOT NULL DEFAULT false;
