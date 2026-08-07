-- Rename the text fields that sit directly above a signature field on any form —
-- "Customer Name" -> "Contact Person Name" (it's whoever signed on the customer's
-- behalf, not necessarily the customer/company itself) and "EMR Name"/"EMR Engineer
-- Name" -> "Engineer Name". Scoped to fields sharing a section with a 'signature'
-- field so this only touches the Signatures section, not unrelated fields elsewhere
-- on the form (e.g. the "Customer Name" field at the top of the NIFPS form, or the
-- "EMR Engineer Name" prefill field in "Customer & Transformer Details").
update public.form_fields
set label = 'Contact Person Name'
where label = 'Customer Name'
  and section_id in (select section_id from public.form_fields where field_type = 'signature');

update public.form_fields
set label = 'Engineer Name'
where label in ('EMR Name', 'EMR Engineer Name')
  and section_id in (select section_id from public.form_fields where field_type = 'signature');
