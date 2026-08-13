-- Add invite_pending to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_pending boolean NOT NULL DEFAULT false;

-- Mark existing users (pre-migration) as not pending
UPDATE public.profiles SET invite_pending = false;
