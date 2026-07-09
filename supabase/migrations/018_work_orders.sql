-- Work orders
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number TEXT UNIQUE NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('site_inspection', 'amc', 'commissioning_activities', 'supervision')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'assigned', 'in_progress', 'pending', 'completed')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many serial numbers per work order (all from same customer)
CREATE TABLE public.work_order_transformers (
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  transformer_id UUID NOT NULL REFERENCES public.transformers(id) ON DELETE CASCADE,
  PRIMARY KEY (work_order_id, transformer_id)
);

-- Activity log for timeline
CREATE TABLE public.work_order_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_transformers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read work_orders" ON public.work_orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read work_order_transformers" ON public.work_order_transformers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated read work_order_activity" ON public.work_order_activity
  FOR SELECT USING (auth.uid() IS NOT NULL);
