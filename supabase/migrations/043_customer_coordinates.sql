-- Cache for geocoded customer addresses — fallback distance-basis for ranking Field
-- Engineers on a work order whose linked transformer has no customer_site
-- (transformers.site_id null, so customer_sites.latitude/longitude can't be used).
-- This happens whenever a transformer was registered without being tied to a
-- specific project/site. Same lazy-populate-on-lookup pattern as customer_sites'
-- latitude/longitude/place_label (028_customer_site_coordinates.sql,
-- 031_customer_site_place_label.sql).
alter table public.customers add column latitude numeric;
alter table public.customers add column longitude numeric;
alter table public.customers add column place_label text;
