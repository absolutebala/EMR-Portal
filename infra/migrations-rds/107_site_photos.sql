-- Site photos: free-form photos a field engineer attaches to a notification from the
-- mobile app (separate from job-form photo fields). Many per notification, added over
-- multiple visits; shown on mobile + web. Stored in S3 (site-photos/ key prefix).
CREATE TABLE IF NOT EXISTS public.site_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_photos_work_order_id_idx ON public.site_photos(work_order_id);
