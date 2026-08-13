-- Documents real schema drift discovered during the Supabase -> RDS migration
-- (Phase C): col1_label/col2_label exist on the live Supabase production database
-- but were never captured in any tracked migration file — added directly against
-- Supabase at some point (dashboard/SQL editor), not through this migration history.
-- Retroactively recorded here so the tracked migrations match reality.
ALTER TABLE public.form_tables ADD COLUMN IF NOT EXISTS col1_label text;
ALTER TABLE public.form_tables ADD COLUMN IF NOT EXISTS col2_label text;
