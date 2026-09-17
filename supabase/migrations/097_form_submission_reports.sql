-- Per-form report documents. Each submitted form now generates its own PDF/Word
-- report (the filled form = the document), instead of a single visit doc built
-- from one form at closure. Stored on the form_submissions row that produced them.
-- Nullable — populated asynchronously after a submission is saved; older rows and
-- offline-synced rows simply have no report until (re)generated.
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS pdf_url text;
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS word_url text;
