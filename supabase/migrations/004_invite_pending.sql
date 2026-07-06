-- Add invite_pending to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_pending boolean NOT NULL DEFAULT false;

-- Mark existing users (pre-migration) as not pending
UPDATE public.profiles SET invite_pending = false;

-- Trigger: flip invite_pending = false when user confirms their email
CREATE OR REPLACE FUNCTION public.handle_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles SET invite_pending = false WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_confirmed ON auth.users;
CREATE TRIGGER on_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_confirmed();
