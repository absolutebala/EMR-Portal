-- Visit summary is now also generated as a Word (.docx) document alongside
-- the existing PDF, so office staff can edit the summary before filing it.
ALTER TABLE public.work_order_daily_closures ADD COLUMN IF NOT EXISTS word_url TEXT;
ALTER TABLE public.work_order_visits ADD COLUMN IF NOT EXISTS word_url TEXT;
