-- Warranty expiry + Extend/Renew with two-level approval.
--
-- Adds an explicit warranty_expiry_date on transformers (extend/renew push it forward),
-- and a renewal_requests table modeled on leave_requests (100) with the two-level status
-- machine from expense_logs (048): pending -> manager_approved -> approved, with
-- 'rejected' final from either stage. Requests from anyone below Head of Service (Field
-- Engineers, Service Managers) need Service Manager then Head of Service approval; Head
-- of Service / Super Admin apply immediately. Extend shows while the expiry date is in
-- the future; Renew once it has lapsed.

ALTER TABLE public.transformers ADD COLUMN IF NOT EXISTS warranty_expiry_date date;

-- Baseline the expiry from dispatch date + warranty years where both are on record
-- (currently none, but keeps future rows consistent).
UPDATE public.transformers
  SET warranty_expiry_date = (dispatch_date + (warranty_years || ' years')::interval)::date
  WHERE warranty_expiry_date IS NULL AND dispatch_date IS NOT NULL AND warranty_years IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.renewal_requests (
  id uuid primary key default gen_random_uuid(),
  transformer_id uuid not null references public.transformers(id) on delete cascade,
  request_type text not null check (request_type in ('extend', 'renew')),
  years integer not null check (years > 0),
  comments text,
  requested_by uuid references public.profiles(id) on delete set null,
  -- Two-level: pending -> manager_approved -> approved; rejected final from either stage.
  status text not null default 'pending' check (status in ('pending', 'manager_approved', 'approved', 'rejected')),
  manager_approved_by uuid references public.profiles(id) on delete set null,
  manager_approved_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  previous_expiry_date date,
  new_expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS renewal_requests_transformer_idx ON public.renewal_requests (transformer_id);
CREATE INDEX IF NOT EXISTS renewal_requests_status_idx ON public.renewal_requests (status);
-- At most one open (pending/manager_approved) request per transformer.
CREATE UNIQUE INDEX IF NOT EXISTS renewal_requests_one_open_idx
  ON public.renewal_requests (transformer_id) WHERE status IN ('pending', 'manager_approved');

-- Permission keys (mirrors the Expenses two-level pair).
UPDATE public.roles
  SET permissions = permissions || '{"Renewal Requests — View": true, "Renewal Requests — Approve": true, "Renewal Requests — Final Approve": true}'::jsonb
  WHERE name IN ('Super Admin', 'Head of Service');
UPDATE public.roles
  SET permissions = permissions || '{"Renewal Requests — View": true, "Renewal Requests — Approve": true}'::jsonb
  WHERE name = 'Service Manager';

NOTIFY pgrst, 'reload schema';
