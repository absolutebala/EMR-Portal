-- Convert profiles.role from enum to text and create a managed roles table.

-- 1. Create roles table (name is PK so FK + CASCADE rename works cleanly)
create table public.roles (
  name text primary key,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Seed with existing roles (marked as system so UI can protect them)
insert into public.roles (name, is_system) values
  ('Super Admin',             true),
  ('Service Manager',         true),
  ('Service Engineer',        true),
  ('Sales Executive Engineer',true),
  ('Inventory Team',          true),
  ('Dispatch Team',           true),
  ('Reporting Team',          true);

-- 3. Convert profiles.role from enum to text
alter table public.profiles
  alter column role type text using role::text;

-- 4. Drop the old enum (no longer needed)
drop type if exists user_role;

-- 5. Add FK so profiles.role must exist in roles.name
--    ON UPDATE CASCADE: renaming a role auto-updates all profiles
--    ON DELETE RESTRICT: can't delete a role that has users assigned
alter table public.profiles
  add constraint profiles_role_fkey
  foreign key (role) references public.roles(name)
  on update cascade
  on delete restrict;

-- 6. RLS on roles table
alter table public.roles enable row level security;

create policy "Authenticated users can view roles" on public.roles
  for select using (auth.role() = 'authenticated');

create policy "Super Admin can manage roles" on public.roles
  for all using (get_my_role() = 'Super Admin');
