alter table public.profiles
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
