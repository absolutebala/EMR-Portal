-- Employee ID is no longer mandatory when creating/editing a user (e.g. a field
-- engineer added by name/email/phone alone). The UNIQUE constraint stays — Postgres
-- treats NULLs as distinct, so any number of users can have no employee ID while a
-- given non-null ID is still unique. Blank input is stored as NULL by the invite/
-- update actions so multiple "no ID" users don't collide on an empty string.
alter table public.profiles alter column employee_id drop not null;
