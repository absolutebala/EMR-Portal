-- The "Engineer Name" field beside the signature (renamed from "EMR Name"/"EMR
-- Engineer Name" by 050_signature_field_labels.sql) should auto-populate with the
-- logged-in engineer's name, same as the "EMR Engineer Name" field elsewhere on the
-- form already does. Depends on 050 having already renamed the label.
update public.form_fields
set prefill_from_job = true
where label = 'Engineer Name'
  and section_id in (select section_id from public.form_fields where field_type = 'signature');
