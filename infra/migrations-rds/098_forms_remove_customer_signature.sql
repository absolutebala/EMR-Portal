-- Sign-off rework: forms no longer carry a customer signature. The customer (and
-- field engineer) sign ONCE, at "Mark Completed", not on every form. Remove the
-- Customer Signature field from every form. (Field Engineer Signature stays on the
-- forms as the per-form report's author signature.) Also add customer/engineer
-- contact columns to the closure so the completion sign-off records both parties'
-- phone numbers alongside the existing names/signatures.
delete from public.form_fields
where field_type = 'signature'
  and lower(label) like '%customer%';

alter table public.work_order_daily_closures add column if not exists client_phone text;
alter table public.work_order_daily_closures add column if not exists engineer_phone text;
