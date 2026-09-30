-- Second notification type: customer details typed directly onto the notification (a
-- one-off customer NOT saved to the customers table). Customer messaging + display fall
-- back to these fields when customer_id is null.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_customer_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_contact_person text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_phone text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_whatsapp text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_email text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_address text;
