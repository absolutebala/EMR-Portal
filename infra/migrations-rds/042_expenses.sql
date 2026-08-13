-- Field-engineer expense logging: engineers log expenses (travel, food, etc.)
-- against a specific assigned notification/work order ("Project" in the UI).
-- expense_types is an admin-managed catalog engineers can also add to inline
-- (same pattern as customer_categories). Each expense_logs row starts 'pending'
-- and an admin with 'Expenses — Approve' can approve/reject it on the new
-- desktop /expenses page.

CREATE TABLE public.expense_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.expense_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.expense_types (name) VALUES
  ('Travel'), ('Food'), ('Lodging'), ('Fuel'), ('Miscellaneous')
ON CONFLICT (name) DO NOTHING;

UPDATE public.roles
SET permissions = permissions || '{"Expenses — View": true, "Expenses — Approve": true}'::jsonb
WHERE name IN ('Super Admin', 'Service Manager');
