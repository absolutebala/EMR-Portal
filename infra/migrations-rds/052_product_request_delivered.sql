-- Adds a "delivered" stage after "dispatched" to the product request item
-- lifecycle: pending -> approved -> dispatched -> delivered (or rejected at the
-- pending stage). Gated by the same "Product Requests — Dispatch" permission as
-- marking dispatched — Service Manager and Super Admin already have it from
-- migration 039, this doesn't change who can act, only what they can mark.
alter table public.product_request_items drop constraint if exists product_request_items_status_check;
alter table public.product_request_items add constraint product_request_items_status_check
  check (status in ('pending', 'approved', 'rejected', 'dispatched', 'delivered'));

alter table public.product_request_items add column delivered_at timestamptz;
