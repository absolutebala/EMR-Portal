-- Custom roster order for the desktop Attendance "Field Engineer" column. NULL sorts
-- last (after the image-ordered engineers), then by name. Set from the provided roster.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_order integer;

NOTIFY pgrst, 'reload schema';
