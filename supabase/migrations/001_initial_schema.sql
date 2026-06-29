-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- PROFILES (extends auth.users)
-- =====================
create type user_role as enum (
  'Super Admin',
  'Service Manager',
  'Service Engineer',
  'Sales Executive Engineer',
  'Inventory Team',
  'Dispatch Team',
  'Reporting Team'
);

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  first_name text not null,
  last_name text not null,
  employee_id text unique not null,
  email text unique not null,
  phone text,
  department text,
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Super Admin and Service Manager can view all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

create policy "Super Admin can insert profiles" on public.profiles
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role = 'Super Admin'
    )
  );

create policy "Super Admin can update profiles" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role = 'Super Admin'
    )
  );

-- =====================
-- USER MODULE ACCESS
-- =====================
create type module_name as enum ('field_management', 'sales');

create table public.user_module_access (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module module_name not null,
  created_at timestamptz not null default now(),
  unique(user_id, module)
);

alter table public.user_module_access enable row level security;

create policy "Admins can manage module access" on public.user_module_access
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

create policy "Users can view their own module access" on public.user_module_access
  for select using (user_id = auth.uid());

-- =====================
-- CUSTOMERS
-- =====================
create type customer_type as enum ('sold', 'shipped', 'both');

create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type customer_type not null default 'both',
  contact_person text not null,
  designation text,
  phone text not null,
  email text,
  whatsapp_number text,
  sap_customer_code text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Authenticated users can view customers" on public.customers
  for select using (auth.uid() is not null);

create policy "Admins and managers can manage customers" on public.customers
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- CUSTOMER SITES
-- =====================
create table public.customer_sites (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_name text not null,
  site_address text not null,
  created_at timestamptz not null default now()
);

alter table public.customer_sites enable row level security;

create policy "Authenticated users can view sites" on public.customer_sites
  for select using (auth.uid() is not null);

create policy "Admins can manage sites" on public.customer_sites
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- TRANSFORMERS
-- =====================
create type warranty_status as enum ('under_warranty', 'expired', 'amc');

create table public.transformers (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_id uuid references public.customer_sites(id) on delete set null,
  serial_number text unique not null,
  rating text,
  manufacturer text,
  year_of_manufacture text,
  warranty_status warranty_status not null default 'under_warranty',
  created_at timestamptz not null default now()
);

alter table public.transformers enable row level security;

create policy "Authenticated users can view transformers" on public.transformers
  for select using (auth.uid() is not null);

create policy "Admins can manage transformers" on public.transformers
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- SETTINGS (single row)
-- =====================
create table public.settings (
  id uuid primary key default uuid_generate_v4(),
  org_name text not null default 'EMR Global',
  logo_url text,
  theme_color text not null default '#7D1D3F',
  timezone text not null default 'Asia/Kolkata',
  date_format text not null default 'DD MMM YYYY',
  admin_email text not null default 'admin@emrglobal.com',
  whatsapp_api_key text,
  sms_gateway text,
  sms_api_key text,
  sms_sender_id text,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "Authenticated users can view settings" on public.settings
  for select using (auth.uid() is not null);

create policy "Super Admin can manage settings" on public.settings
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role = 'Super Admin'
    )
  );

-- Insert default settings row
insert into public.settings (org_name, theme_color, timezone, date_format, admin_email)
values ('EMR Global', '#7D1D3F', 'Asia/Kolkata', 'DD MMM YYYY', 'admin@emrglobal.com');

-- =====================
-- FORMS
-- =====================
create type form_status as enum ('draft', 'active');
create type job_type as enum ('site_inspection', 'amc', 'commissioning_activities', 'supervision');
create type field_type as enum ('text', 'long_text', 'number', 'date', 'dropdown', 'photo', 'signature', 'checkbox');
create type status_type as enum ('yes_no', 'tested_not_tested', 'checkbox_only');

create table public.forms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  job_type job_type not null,
  status form_status not null default 'draft',
  field_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forms enable row level security;

create policy "Authenticated users can view forms" on public.forms
  for select using (auth.uid() is not null);

create policy "Admins can manage forms" on public.forms
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- FORM SECTIONS
-- =====================
create table public.form_sections (
  id uuid primary key default uuid_generate_v4(),
  form_id uuid not null references public.forms(id) on delete cascade,
  title text not null,
  order_index int not null default 0
);

alter table public.form_sections enable row level security;

create policy "Authenticated users can view form sections" on public.form_sections
  for select using (auth.uid() is not null);

create policy "Admins can manage form sections" on public.form_sections
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- FORM FIELDS
-- =====================
create table public.form_fields (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.form_sections(id) on delete cascade,
  label text not null,
  field_type field_type not null default 'text',
  is_required boolean not null default false,
  prefill_from_job boolean not null default false,
  read_only_on_mobile boolean not null default false,
  placeholder text,
  help_text text,
  order_index int not null default 0
);

alter table public.form_fields enable row level security;

create policy "Authenticated users can view form fields" on public.form_fields
  for select using (auth.uid() is not null);

create policy "Admins can manage form fields" on public.form_fields
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- FORM TABLES
-- =====================
create table public.form_tables (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.form_sections(id) on delete cascade,
  status_type status_type not null default 'yes_no',
  has_subrows boolean not null default false,
  order_index int not null default 0
);

alter table public.form_tables enable row level security;

create policy "Authenticated users can view form tables" on public.form_tables
  for select using (auth.uid() is not null);

create policy "Admins can manage form tables" on public.form_tables
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- FORM TABLE ROWS
-- =====================
create table public.form_table_rows (
  id uuid primary key default uuid_generate_v4(),
  table_id uuid not null references public.form_tables(id) on delete cascade,
  parent_row_id uuid references public.form_table_rows(id) on delete cascade,
  row_label text not null,
  sno_label text,
  order_index int not null default 0
);

alter table public.form_table_rows enable row level security;

create policy "Authenticated users can view form table rows" on public.form_table_rows
  for select using (auth.uid() is not null);

create policy "Admins can manage form table rows" on public.form_table_rows
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
      and p.role in ('Super Admin', 'Service Manager')
    )
  );

-- =====================
-- TRIGGER: update forms.updated_at
-- =====================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger forms_updated_at
  before update on public.forms
  for each row execute function update_updated_at();

create trigger settings_updated_at
  before update on public.settings
  for each row execute function update_updated_at();
