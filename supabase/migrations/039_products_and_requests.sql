-- Product catalog (admin-managed stand-in for SAP inventory — no real SAP
-- integration exists in this codebase, same "mocked, not live" pattern already used
-- for visit PDFs/"sent to SAP" elsewhere) and the field-engineer request/approval/
-- dispatch workflow against it. 'Products — View' and 'Product Requests —
-- View/Approve/Dispatch' permission keys already existed in RolesModal's MODULES
-- list as placeholders for this — this migration is what makes them do something.

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sap_code TEXT,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per submission (a "cart" of items + damage photos for a single work
-- order); each item inside it is tracked and resolved independently.
CREATE TABLE public.product_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  damage_photo_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.product_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.product_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'dispatched')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivery_estimate DATE,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read products" ON public.products
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated read product_requests" ON public.product_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Engineers insert own product_requests" ON public.product_requests
  FOR INSERT WITH CHECK (engineer_id = auth.uid());
CREATE POLICY "Authenticated read product_request_items" ON public.product_request_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

UPDATE public.roles
SET permissions = permissions || '{"Products — View": true, "Product Requests — View": true, "Product Requests — Approve": true, "Product Requests — Dispatch": true}'::jsonb
WHERE name IN ('Super Admin', 'Service Manager');
