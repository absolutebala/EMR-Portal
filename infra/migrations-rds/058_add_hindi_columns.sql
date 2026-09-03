-- Adds nullable Hindi-translation columns alongside the existing English text
-- columns, for the mobile form-fill English/Hindi language toggle. English
-- columns remain the canonical/required text (used for prefill matching etc.);
-- the _hi columns are optional per-row/per-field overrides shown only when a
-- form actually has bilingual content (e.g. NIFPS Installation - Assessment).
--
-- NOTE: applied to RDS only via the schema-runner Lambda, never to Supabase
-- (Supabase writes were cut off after the AWS migration cutover).
ALTER TABLE public.form_sections ADD COLUMN IF NOT EXISTS title_hi text;
ALTER TABLE public.form_fields ADD COLUMN IF NOT EXISTS label_hi text;
ALTER TABLE public.form_tables ADD COLUMN IF NOT EXISTS col1_label_hi text;
ALTER TABLE public.form_tables ADD COLUMN IF NOT EXISTS col2_label_hi text;
ALTER TABLE public.form_table_rows ADD COLUMN IF NOT EXISTS row_label_hi text;
ALTER TABLE public.form_table_rows ADD COLUMN IF NOT EXISTS sno_label_hi text;
