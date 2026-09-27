-- Adds a human-friendly device name (model / user-set name captured on the mobile
-- side, e.g. "Samsung SM-A525F") alongside the opaque per-install device_id, so the
-- dashboard's suspicious-login detail can show which physical phones an account has
-- logged in from — not just anonymous ids.
ALTER TABLE public.login_events ADD COLUMN IF NOT EXISTS device_name TEXT;

NOTIFY pgrst, 'reload schema';
