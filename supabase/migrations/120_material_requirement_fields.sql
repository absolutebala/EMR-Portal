-- Material Requirement (product request) form: capture the site/customer snapshot the
-- field engineer confirms at submit, and restrict approval to Head of Service.
--
-- Fields are nullable: already-installed native app builds don't send them and must keep
-- submitting successfully (the "required" rule is enforced client-side in the updated
-- apps, not in the DB). Snapshot only — not written back to the customers table.

ALTER TABLE public.product_requests
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS oltc_sl_no text,
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS site_contact text;

-- Approval is Head of Service / Super Admin only; Service Manager becomes view-only.
-- (Head of Service / Super Admin approve via the app's always-pass, so no grant needed;
-- just remove the Service Manager's approve capability.)
UPDATE public.roles
  SET permissions = permissions - 'Product Requests — Approve'
  WHERE name = 'Service Manager';

NOTIFY pgrst, 'reload schema';
