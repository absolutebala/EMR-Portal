-- Voluntary "Day Off" on the attendance row. Distinct from an Absent/no-show: the
-- engineer chooses it from the mobile dashboard. Auto-approved on Sundays and holidays
-- (approval_status set to 'approved' by the app), otherwise sent to the Service Manager
-- for approval (approval_status 'pending') reusing the existing amendment approval flow.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS day_off boolean NOT NULL DEFAULT false;
