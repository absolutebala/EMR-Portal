-- Cache for geocoded site addresses, used to rank Field Engineers by distance
-- when assigning/reassigning a work order. Populated lazily (on first lookup)
-- by getAssignableEngineers() rather than backfilled here, since geocoding is
-- an external API call best done on demand and cached, not in bulk.
alter table public.customer_sites add column latitude numeric;
alter table public.customer_sites add column longitude numeric;
