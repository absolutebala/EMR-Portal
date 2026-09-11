-- Punch-in categories v2: a hierarchical scheme replacing the flat five.
-- Top level: hq, business_dev, others, travel, site_visit. Travel and Site Visit each
-- have four sub-types (recoverable / non_recoverable / nfpfs_installation /
-- nfpfs_commissioning), stored as a single combined key. HQ needs no visit details;
-- every other category collects customer/site/purpose. Legacy keys (travel_r, travel_nr,
-- site_r, site_nr) stay valid so historical rows keep rendering with their old colours.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_punch_category_check') THEN
    ALTER TABLE public.attendance DROP CONSTRAINT attendance_punch_category_check;
  END IF;
  ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_punch_category_check
    CHECK (punch_category IS NULL OR punch_category IN (
      -- legacy (v1)
      'travel_r','travel_nr','site_r','site_nr',
      -- v2 top-level with no sub-type
      'hq','business_dev','others',
      -- v2 Travel sub-types
      'travel_recoverable','travel_non_recoverable','travel_nfpfs_installation','travel_nfpfs_commissioning',
      -- v2 Site Visit sub-types
      'site_recoverable','site_non_recoverable','site_nfpfs_installation','site_nfpfs_commissioning'
    ));
END $$;
