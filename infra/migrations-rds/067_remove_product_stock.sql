-- Stock is no longer tracked on products — per explicit product decision, 2026-08-19,
-- removed everywhere: admin catalog page, and the "out of stock" gate/display on both
-- mobile product-request pickers (PWA + native app).
ALTER TABLE public.products
  DROP COLUMN stock_qty;
