ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Mark all pending users (never logged in) as needing to set a password
UPDATE profiles SET must_change_password = true WHERE invite_pending = true;
