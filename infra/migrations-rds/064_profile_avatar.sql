-- Supports the mobile app's profile picture (replaces the top-right "Sign out" text
-- with a tappable avatar) and the dashboard streak strip's underlying data doesn't need
-- a schema change — it's derived entirely from existing work_order_daily_closures rows.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
