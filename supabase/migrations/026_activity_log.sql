-- System-wide activity log: one row per admin/engineer action, independent of the
-- per-work-order work_order_activity feed. Powers the admin "Activities" page.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index activity_log_actor_id_idx on public.activity_log(actor_id);
create index activity_log_created_at_idx on public.activity_log(created_at desc);
create index activity_log_entity_type_idx on public.activity_log(entity_type);

alter table public.activity_log enable row level security;

create policy "Authenticated read activity_log" on public.activity_log
  for select using (auth.uid() is not null);

-- New permission key so the nav item + page are hidden unless explicitly granted.
update public.roles
set permissions = permissions || '{"Activities — View": true}'::jsonb
where name in ('Super Admin', 'Service Manager');
