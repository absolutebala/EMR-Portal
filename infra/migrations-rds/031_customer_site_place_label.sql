-- Cached "place, state" label derived from the same geocoding lookup that
-- produces latitude/longitude (028_customer_site_coordinates.sql) — reused so
-- the engineer's "Upcoming schedule" list can show a human-readable location
-- without a live geocode call per row.
alter table public.customer_sites add column place_label text;
