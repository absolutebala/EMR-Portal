-- Real multi-engineer assignment for a notification — distinct from
-- work_order_additional_engineers (migration 035), which is deliberately a
-- visibility-only list for Virtual-solution jobs and is never read by any mobile
-- code path. This table drives actual mobile job visibility and independent
-- check-in/closure for engineers OTHER than the primary work_orders.engineer_id
-- (which stays the sole driver of the notification's own status field — see
-- lib/mobile/core/workOrders.ts).
CREATE TABLE public.work_order_engineer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL = this engineer covers the whole notification (no serial split needed —
  -- e.g. only one transformer exists on the WO). A non-NULL row is an explicit
  -- serial carve-out. At most one NULL row per (work_order_id, engineer_id) is
  -- enforced in application code, not here — Postgres UNIQUE treats NULLs as
  -- distinct, so a DB constraint alone can't express that.
  transformer_id UUID REFERENCES public.transformers(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, engineer_id, transformer_id)
);

CREATE INDEX work_order_engineer_assignments_engineer_idx ON public.work_order_engineer_assignments (engineer_id);
CREATE INDEX work_order_engineer_assignments_wo_idx ON public.work_order_engineer_assignments (work_order_id);
