create table if not exists public.nifps_assessments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  transformer_id uuid references public.transformers(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  form_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nifps_assessments enable row level security;

create policy "Authenticated users can view assessments" on public.nifps_assessments
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert assessments" on public.nifps_assessments
  for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update assessments" on public.nifps_assessments
  for update using (auth.role() = 'authenticated');
