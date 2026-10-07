-- ZFOD: the SAP/order reference the Head of Service enters when approving a spare
-- request (product request) line. Mandatory at approval (enforced in the app, not the
-- DB, so existing rows and non-approval status changes are unaffected) and surfaced
-- everywhere the item is shown afterwards.
ALTER TABLE public.product_request_items
  ADD COLUMN IF NOT EXISTS zfod text;

NOTIFY pgrst, 'reload schema';
