alter table public.roles
  add column if not exists requires_manager boolean not null default false;

-- Field Engineer (renamed from Service Engineer) must have a reporting manager
update public.roles set requires_manager = true where name = 'Field Engineer';
-- Also cover original name in case it hasn't been renamed yet
update public.roles set requires_manager = true where name = 'Service Engineer';
