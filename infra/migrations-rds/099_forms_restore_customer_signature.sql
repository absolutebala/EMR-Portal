-- Revert 098: forms keep BOTH the Customer Signature and Field Engineer Signature
-- (as before). Sign-off is captured on the forms again; "Mark Completed" no longer
-- runs a sign-off ceremony. Re-add a Customer Signature field to every form's
-- sign-off section (the section that has a Field Engineer Signature), positioned
-- immediately before the Field Engineer block, so the order reads
-- ...customer fields..., Customer Signature, Field Engineer ...
do $$
declare
  r record;
  fe_min int;
begin
  for r in
    select distinct s.id as section_id
    from public.form_sections s
    join public.form_fields ff on ff.section_id = s.id
    where ff.field_type = 'signature' and lower(ff.label) like '%field engineer%'
      -- only if this section doesn't already have a customer signature
      and not exists (
        select 1 from public.form_fields c
        where c.section_id = s.id and c.field_type = 'signature' and lower(c.label) like '%customer%'
      )
  loop
    select min(order_index) into fe_min
    from public.form_fields
    where section_id = r.section_id and lower(label) like 'field engineer%';

    if fe_min is null then fe_min := 100; end if;

    update public.form_fields
    set order_index = order_index + 1
    where section_id = r.section_id and order_index >= fe_min;

    insert into public.form_fields
      (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
    values (r.section_id, 'Customer Signature', 'signature', true, false, false, fe_min);
  end loop;
end $$;
