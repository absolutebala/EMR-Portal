create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  designation text,
  phone text,
  email text,
  whatsapp_number text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Migrate existing single contact from customers table
insert into public.customer_contacts (customer_id, name, designation, phone, email, whatsapp_number, is_primary)
select id, contact_person, designation, phone, email, whatsapp_number, true
from public.customers
where contact_person is not null and contact_person <> '';

alter table public.customer_contacts enable row level security;

create policy "Authenticated users can view contacts" on public.customer_contacts
  for select using (auth.role() = 'authenticated');

create policy "Admins can manage contacts" on public.customer_contacts
  for all using (get_my_role() in ('Super Admin', 'Service Manager'));
