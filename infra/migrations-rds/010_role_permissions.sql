-- Add permissions JSONB column to roles and seed defaults.
alter table public.roles add column if not exists permissions jsonb not null default '{}';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', true, 'Work Orders — View', true, 'Work Orders — Create / Edit', true,
  'Work Orders — Delete', true, 'Field Engineers — View', true, 'Field Engineers — Manage', true,
  'Users — View', true, 'Users — Create / Edit', true, 'Customers — View', true,
  'Customers — Create / Edit', true, 'Products — View', true, 'Forms — View', true,
  'Forms — Create / Edit', true, 'Product Requests — View', true, 'Product Requests — Approve', true,
  'Product Requests — Dispatch', true, 'MoM — View / Download', true, 'Settings', true
) where name = 'Super Admin';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', true, 'Work Orders — View', true, 'Work Orders — Create / Edit', true,
  'Work Orders — Delete', false, 'Field Engineers — View', true, 'Field Engineers — Manage', true,
  'Users — View', true, 'Users — Create / Edit', false, 'Customers — View', true,
  'Customers — Create / Edit', true, 'Products — View', true, 'Forms — View', true,
  'Forms — Create / Edit', false, 'Product Requests — View', true, 'Product Requests — Approve', true,
  'Product Requests — Dispatch', false, 'MoM — View / Download', true, 'Settings', false
) where name = 'Service Manager';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', false, 'Work Orders — View', true, 'Work Orders — Create / Edit', false,
  'Work Orders — Delete', false, 'Field Engineers — View', false, 'Field Engineers — Manage', false,
  'Users — View', false, 'Users — Create / Edit', false, 'Customers — View', true,
  'Customers — Create / Edit', false, 'Products — View', true, 'Forms — View', false,
  'Forms — Create / Edit', false, 'Product Requests — View', true, 'Product Requests — Approve', false,
  'Product Requests — Dispatch', false, 'MoM — View / Download', true, 'Settings', false
) where name = 'Service Engineer';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', false, 'Work Orders — View', false, 'Work Orders — Create / Edit', false,
  'Work Orders — Delete', false, 'Field Engineers — View', false, 'Field Engineers — Manage', false,
  'Users — View', false, 'Users — Create / Edit', false, 'Customers — View', false,
  'Customers — Create / Edit', false, 'Products — View', true, 'Forms — View', false,
  'Forms — Create / Edit', false, 'Product Requests — View', true, 'Product Requests — Approve', true,
  'Product Requests — Dispatch', false, 'MoM — View / Download', false, 'Settings', false
) where name = 'Inventory Team';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', false, 'Work Orders — View', false, 'Work Orders — Create / Edit', false,
  'Work Orders — Delete', false, 'Field Engineers — View', false, 'Field Engineers — Manage', false,
  'Users — View', false, 'Users — Create / Edit', false, 'Customers — View', false,
  'Customers — Create / Edit', false, 'Products — View', true, 'Forms — View', false,
  'Forms — Create / Edit', false, 'Product Requests — View', true, 'Product Requests — Approve', false,
  'Product Requests — Dispatch', true, 'MoM — View / Download', false, 'Settings', false
) where name = 'Dispatch Team';

update public.roles set permissions = jsonb_build_object(
  'Dashboard', true, 'Work Orders — View', true, 'Work Orders — Create / Edit', false,
  'Work Orders — Delete', false, 'Field Engineers — View', true, 'Field Engineers — Manage', false,
  'Users — View', false, 'Users — Create / Edit', false, 'Customers — View', true,
  'Customers — Create / Edit', false, 'Products — View', true, 'Forms — View', false,
  'Forms — Create / Edit', false, 'Product Requests — View', true, 'Product Requests — Approve', false,
  'Product Requests — Dispatch', false, 'MoM — View / Download', true, 'Settings', false
) where name = 'Reporting Team';

update public.roles set permissions = '{}' where name = 'Sales Executive Engineer';
