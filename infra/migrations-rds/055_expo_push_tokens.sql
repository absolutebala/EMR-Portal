-- Schema for the React Native (Expo) mobile app's native push notifications.
-- Additive alongside the existing Web Push `push_subscriptions` table (used by the
-- PWA) — both are fanned out to from the same notifyUsers() call sites once
-- lib/push.ts's sendExpoPushToUser() is wired in (Phase 5 of the RN migration).
-- Unused until then; landed now since it's a cheap, independent schema change.
create table public.expo_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expo_push_tokens_user_id_idx on public.expo_push_tokens(user_id);
