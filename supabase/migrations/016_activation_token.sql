-- Add a stable activation token to each profile.
-- The invite link points to /activate?token=<uuid> instead of a one-time Supabase URL.
-- The token is cleared (set NULL) only after the user successfully sets their password,
-- so the same link can be opened as many times as needed until then.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS activation_token UUID;

-- Back-fill existing rows so they all have a token.
UPDATE profiles SET activation_token = gen_random_uuid() WHERE activation_token IS NULL;
