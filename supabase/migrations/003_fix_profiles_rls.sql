-- Fix infinite recursion in profiles RLS policies.
-- The old policies queried `profiles` inside the policy itself, causing recursion.
-- Solution: a SECURITY DEFINER function that bypasses RLS to read the caller's role.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Drop old recursive policies
drop policy if exists "Super Admin and Service Manager can view all profiles" on public.profiles;
drop policy if exists "Super Admin can insert profiles" on public.profiles;
drop policy if exists "Super Admin can update profiles" on public.profiles;

-- Recreate without recursion
create policy "Super Admin and Service Manager can view all profiles" on public.profiles
  for select using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );

create policy "Super Admin can insert profiles" on public.profiles
  for insert with check (
    get_my_role() = 'Super Admin'
  );

create policy "Super Admin can update profiles" on public.profiles
  for update using (
    get_my_role() = 'Super Admin'
  );
