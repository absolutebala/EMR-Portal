-- Customer Type (Utility / Industry) + a searchable, creatable category catalog per
-- type, shown on the notification creation/edit form. Seeded with the initial known
-- categories, but engineers/admins can add new ones inline from the form — same
-- "admin-managed catalog with inline create" pattern as the Products feature.
CREATE TABLE public.customer_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_type TEXT NOT NULL CHECK (customer_type IN ('utility', 'industry')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_type, name)
);

ALTER TABLE public.customer_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read customer_categories" ON public.customer_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.customer_categories (customer_type, name) VALUES
  ('industry', 'Steel Plant'),
  ('industry', 'SAIL'),
  ('industry', 'Sugar'),
  ('industry', 'Cement'),
  ('utility', 'TANGEDCO'),
  ('utility', 'MSEDCL'),
  ('utility', 'KSEBL'),
  ('utility', 'BESCOM')
ON CONFLICT (customer_type, name) DO NOTHING;

ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_type TEXT CHECK (customer_type IN ('utility', 'industry'));
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS customer_category_id UUID REFERENCES public.customer_categories(id) ON DELETE SET NULL;
