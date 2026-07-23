-- Explicit engineer-set daily status (Available / On Leave / On the Way / Travelling),
-- auto-transitioned to "Reached <site>" on site check-in — replaces the old
-- heuristic-derived status (last_active_at window + checkin/form presence) on the
-- Field Engineers page, which could only ever guess "on site" / "off duty".
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS engineer_status TEXT
  NOT NULL DEFAULT 'available'
  CHECK (engineer_status IN ('available', 'on_leave', 'on_the_way', 'travelling', 'reached'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS engineer_status_work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS engineer_status_updated_at TIMESTAMPTZ;

-- Passive "last seen" location captured on mobile app open, independent of job
-- check-in GPS — lets "Last Seen" on the Field Engineers page reflect where the
-- engineer actually is even between job visits.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_lat NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_lng NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_place_label TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
