-- Lightweight presence heartbeat: updated whenever a field engineer's mobile app
-- makes a data request, so desktop can derive an "Available" vs "Off duty" status
-- without needing continuous background GPS (not reliably possible from a PWA).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Resolved locality/city name captured client-side at check-in time (reverse geocoded
-- from GPS), stored alongside the coordinates so desktop doesn't need to re-geocode.
ALTER TABLE public.work_order_checkins ADD COLUMN IF NOT EXISTS place_name TEXT;
