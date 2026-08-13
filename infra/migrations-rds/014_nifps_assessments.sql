create table if not exists public.nifps_assessments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  transformer_id uuid,
  created_by uuid,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  form_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
