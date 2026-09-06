-- OLTC Service MOM — Service Classification simplification.
-- Warranty and Non-Warranty (and Recoverable / Non-Recoverable) are mutually exclusive
-- opposites, so a single Yes/No toggle is enough: "Warranty = No" already means
-- Non-Warranty, and "Recoverable = No" already means Non-Recoverable. Drop the redundant
-- inverse fields and note the meaning on the remaining ones.
do $$
declare
  v_sec_id uuid;
begin
  select fs.id into v_sec_id
  from public.form_sections fs
  join public.forms f on f.id = fs.form_id
  where f.name = 'OLTC Service MOM' and fs.title = 'Service Classification'
  limit 1;

  if v_sec_id is null then
    return; -- form not seeded in this environment; nothing to do
  end if;

  delete from public.form_fields
  where section_id = v_sec_id and label in ('Non-Warranty', 'Non-Recoverable');

  update public.form_fields set help_text = 'No = Non-Warranty'
  where section_id = v_sec_id and label = 'Warranty';

  update public.form_fields set help_text = 'No = Non-Recoverable'
  where section_id = v_sec_id and label = 'Recoverable';
end $$;
