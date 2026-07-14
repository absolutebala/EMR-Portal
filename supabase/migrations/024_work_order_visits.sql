-- Every site visit (follow-up or final) gets its own engineer + client signature pair,
-- separate from the single "latest state" row in form_submissions. Final visits also get
-- a generated PDF summary and a (mocked — no real SAP integration exists) sent-to-SAP flag.
create table public.work_order_visits (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  engineer_id uuid references public.profiles(id) on delete set null,
  visit_type text not null check (visit_type in ('followup', 'final')),
  form_data jsonb not null default '{}',
  engineer_signature text,
  client_name text,
  client_signature text,
  pdf_url text,
  sent_to_sap boolean not null default false,
  sent_to_sap_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.work_order_visits enable row level security;

create policy "Authenticated read work_order_visits" on public.work_order_visits
  for select using (auth.uid() is not null);

create policy "Engineers insert own visits" on public.work_order_visits
  for insert with check (engineer_id = auth.uid());
