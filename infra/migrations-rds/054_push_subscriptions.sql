-- One row per subscribed device/browser per user (a user can have multiple —
-- phone + tablet, or re-subscribing after clearing site data creates a new
-- endpoint). endpoint is the push service's unique URL for that device, so it
-- doubles as the natural dedupe key.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
