-- Offline / no-photo check-in flag.
--
-- The "Offline Check-In" action on the mobile notification detail lets a field
-- engineer check in with GPS only (no photo, no extra screen). is_offline marks
-- those rows so the desktop can label them distinctly from a normal photo check-in.
-- Defaults false, so every existing row and every normal (photo) check-in is
-- unaffected.
ALTER TABLE public.work_order_checkins
  ADD COLUMN IF NOT EXISTS is_offline boolean NOT NULL DEFAULT false;
