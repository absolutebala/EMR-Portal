-- Records each mobile login with the device and location it happened from, so the web
-- dashboard can flag suspicious activity: the same field engineer appearing on two
-- devices, or an 'impossible travel' login far from where they were moments earlier.
CREATE TABLE IF NOT EXISTS public.login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  place_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_user_time_idx ON public.login_events (user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
