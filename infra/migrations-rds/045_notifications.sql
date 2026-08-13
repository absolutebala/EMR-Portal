-- Per-user alert feed (bell icon / mobile Alerts page) — distinct from activity_log
-- (system-wide audit feed) and from "Notification" the business term for work orders.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_id_idx on public.notifications(recipient_id);
create index notifications_recipient_unread_idx on public.notifications(recipient_id) where read_at is null;
create index notifications_created_at_idx on public.notifications(created_at desc);
