-- Auto-populate the common "necessary" fields on every active form from the
-- notification's job data. Prefill only works when a text field is flagged
-- prefill_from_job AND its label is recognised by the form prefill mapper (RN
-- lib/formPrefill.ts / PWA FormFillView.getPrefillValue). Historically only a
-- hand-picked subset of fields per form carried the flag, so the same
-- Customer/Site/Engineer/Phone/Make/Rating field would prefill on one form but not
-- another. This flags them consistently across all active forms.
--
-- Scoped to text fields only (dates auto-fill to today separately; checkboxes /
-- signatures / long-text must never be auto-filled). Label conditions are
-- deliberately conservative to avoid mis-filling:
--   - customer name / bare "customer" / customer phone / customer contact
--   - site address / installation location / substation-location
--   - field/service engineer name, "inspected by"
--   - transformer manufacturer, rating of transformer
--   - transformer serial ONLY via exact "serial number" / "transformer serial no."
--     (excludes ambiguous device serials like "Smart Breather Serial No.", NIFPS
--     "Sr. No", and tap-changer "Serial No" which would otherwise get the
--     transformer serial).
update public.form_fields ff
set prefill_from_job = true
from public.form_sections s
join public.forms f on f.id = s.form_id
where ff.section_id = s.id
  and f.status = 'active'
  and ff.field_type = 'text'
  and ff.prefill_from_job = false
  and (
       lower(ff.label) = 'customer'
    or lower(ff.label) like 'customer name%'
    or (lower(ff.label) like '%customer%' and lower(ff.label) like '%phone%')
    or (lower(ff.label) like '%customer%' and lower(ff.label) like '%contact%')
    or lower(ff.label) like '%site address%'
    or lower(ff.label) like '%installation location%'
    or lower(ff.label) = 'substation/location'
    or (lower(ff.label) like '%engineer%' and lower(ff.label) like '%name%')
    or lower(ff.label) = 'inspected by'
    or lower(ff.label) like '%manufacturer%'
    or lower(ff.label) like 'rating of transformer%'
    or lower(ff.label) = 'serial number'
    or lower(ff.label) = 'transformer serial no.'
  );
