-- General address field, separate from the site-specific address captured
-- on customer_sites during quick-create — customers.address is the
-- organisation's own address, customer_contacts.address is per-contact.
alter table public.customers add column address text;
alter table public.customer_contacts add column address text;
