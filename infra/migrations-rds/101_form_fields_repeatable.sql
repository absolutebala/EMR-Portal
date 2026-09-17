-- Repeatable "points" fields — item 2 of the 2026-07-14 batch. A field flagged
-- repeatable renders on mobile as a list of point entries with a "+ Add point" button
-- (instead of a single input). The engineer's points are stored newline-joined in the
-- submission's form_data.fields[label], and rendered as a bullet list in the read-only
-- view and the generated PDF/Word report. Used for the OLTC - Service Details section
-- of the MOM Report and Overhauling MOM Report so engineers can add extra service
-- points whenever required.
alter table public.form_fields add column if not exists repeatable boolean not null default false;

do $$
declare
  v_mom_sec uuid;
  v_ovh_sec uuid;
begin
  -- MOM Report already has a "Service Details" long_text in its OLTC - Service Details
  -- section — turn it into the repeatable points list.
  select s.id into v_mom_sec
  from public.form_sections s
  join public.forms f on f.id = s.form_id
  where f.name = 'MOM Report' and s.title = 'OLTC - Service Details'
  limit 1;
  if v_mom_sec is not null then
    update public.form_fields set repeatable = true
    where section_id = v_mom_sec and label = 'Service Details';
  end if;

  -- Overhauling MOM Report's OLTC - Service Details section has only a serial-number
  -- field + the overhauling checklist — add a repeatable "Service Details" points list.
  select s.id into v_ovh_sec
  from public.form_sections s
  join public.forms f on f.id = s.form_id
  where f.name = 'Overhauling MOM Report' and s.title = 'OLTC - Service Details'
  limit 1;
  if v_ovh_sec is not null and not exists (
    select 1 from public.form_fields where section_id = v_ovh_sec and label = 'Service Details'
  ) then
    insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, repeatable, order_index)
    values (v_ovh_sec, 'Service Details', 'long_text', false, false, false, true, 3);
  end if;
end $$;
