-- Site check-ins (GPS + photo proof)
CREATE TABLE public.work_order_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  photo_url TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- End-of-day closures (job completed or marked pending)
CREATE TABLE public.work_order_daily_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'pending')),
  summary TEXT NOT NULL,
  pending_reason TEXT,
  materials_required TEXT,
  revisit_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.work_order_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_daily_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read work_order_checkins" ON public.work_order_checkins
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Engineers insert own checkins" ON public.work_order_checkins
  FOR INSERT WITH CHECK (engineer_id = auth.uid());

CREATE POLICY "Authenticated read work_order_daily_closures" ON public.work_order_daily_closures
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Engineers insert own closures" ON public.work_order_daily_closures
  FOR INSERT WITH CHECK (engineer_id = auth.uid());
