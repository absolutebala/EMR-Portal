-- Single-device login enforcement for Field Engineers.
--
-- Each engineer may be signed in on only one device at a time; logging in on a new
-- device signs the old one out. Enforcement is backend-only (no app change required to
-- take effect) and keyed off the Cognito token's own claims:
--   active_session_id  = origin_jti  — the per-login session id, stable across every
--                        token refresh within that login (an older device therefore
--                        keeps the same value and can never masquerade as the newest).
--   active_auth_time   = auth_time (unix seconds) — the login instant, also stable
--                        across refreshes; used to order logins so the NEWEST always
--                        wins and an older device can never reclaim the account.
-- A request whose token's origin_jti differs from active_session_id and whose auth_time
-- is not newer than active_auth_time is a displaced (older) session and is rejected.
-- Only applied to Field Engineers; all other roles are unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_session_id text,
  ADD COLUMN IF NOT EXISTS active_auth_time bigint;

NOTIFY pgrst, 'reload schema';
