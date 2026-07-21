-- Expand work_orders.job_type CHECK to match the enum values added in 034.
ALTER TABLE public.work_orders DROP CONSTRAINT work_orders_job_type_check;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_job_type_check
  CHECK (job_type IN (
    'site_inspection', 'amc', 'commissioning_activities', 'supervision',
    'overhauling', 'complaint', 'installation', 'testing', 'business_opportunity'
  ));

-- New optional intake/coordination fields — all nullable, existing rows
-- just show blank until edited.
ALTER TABLE public.work_orders ADD COLUMN reported_date DATE;
ALTER TABLE public.work_orders ADD COLUMN reported_through TEXT
  CHECK (reported_through IN ('whatsapp', 'email', 'phone', 'other'));
ALTER TABLE public.work_orders ADD COLUMN customer_message TEXT;
ALTER TABLE public.work_orders ADD COLUMN solution_through TEXT
  CHECK (solution_through IN ('virtual', 'on_site'));

-- Additional engineers for a Virtual-solution notification — the existing
-- engineer_id stays the sole "lead" engineer for scheduling, Attendance,
-- mobile check-in, and reassignment; this table is purely a visibility list
-- of who else is involved in a virtual session, not a full multi-engineer
-- assignment model.
CREATE TABLE public.work_order_additional_engineers (
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (work_order_id, engineer_id)
);

ALTER TABLE public.work_order_additional_engineers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read work_order_additional_engineers" ON public.work_order_additional_engineers
  FOR SELECT USING (auth.uid() IS NOT NULL);
