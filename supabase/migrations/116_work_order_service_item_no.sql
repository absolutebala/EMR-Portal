-- A per-notification service item number ("SI. No.") captured after the Department on
-- the New Notification form. The label shown to the user follows the department
-- (OLTC SI. No. / NIFPS SI. No. / Breather SI. No.) but it is one value stored here.
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS service_item_no text;

NOTIFY pgrst, 'reload schema';
