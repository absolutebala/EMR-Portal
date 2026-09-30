-- Second notification type: instead of linking a customer from the database, the
-- customer's details are typed directly onto the notification (a one-off / ad-hoc
-- customer that is NOT saved to the customers table). These columns hold those details;
-- a notification is "direct-customer" when customer_id IS NULL but direct_customer_name
-- is set. All customer messaging + display fall back to these fields.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_customer_name text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_contact_person text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_phone text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_whatsapp text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_email text;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS direct_address text;

NOTIFY pgrst, 'reload schema';
