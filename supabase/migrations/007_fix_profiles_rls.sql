-- Fix recursive RLS policies on profiles table.
-- The old policies use exists(select from profiles...) which causes infinite recursion.

drop policy if exists "Super Admin and Service Manager can view all profiles" on public.profiles;
create policy "Super Admin and Service Manager can view all profiles" on public.profiles
  for select using (get_my_role() in ('Super Admin', 'Service Manager'));

drop policy if exists "Super Admin can insert profiles" on public.profiles;
create policy "Super Admin can insert profiles" on public.profiles
  for insert with check (get_my_role() = 'Super Admin');

drop policy if exists "Super Admin can update profiles" on public.profiles;
create policy "Super Admin can update profiles" on public.profiles
  for update using (get_my_role() = 'Super Admin');
