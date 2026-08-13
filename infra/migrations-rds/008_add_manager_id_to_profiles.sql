-- Add manager_id to profiles for Service Engineer → Service Manager reporting relationship.
alter table public.profiles
  add column if not exists manager_id uuid references public.profiles(id) on delete set null;
