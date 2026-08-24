-- Seeds "OLTC Service MOM" — transcribed from the attached "MOM Format.docx", an
-- OLTC (On-Load Tap Changer) service visit report distinct from the existing
-- "MOM" form (migration 019, a NIFPS fire-suppression commissioning report — same
-- acronym, unrelated content).
--
-- Created as draft with a placeholder job_type ('overhauling', arbitrary — this form
-- covers Warranty/Non-Warranty/AMC-type OLTC service visits which don't map to one
-- single existing job_type) since it isn't being activated yet — same pattern as
-- migration 059's NIFPS Installation - Assessment form. An admin picks the real
-- job_type from the Forms page and activates it when ready.
--
-- Layout notes:
--   - The source doc's "Warranty / Non-Warranty / Recoverable / Non-Recoverable /
--     Business Opportunity" row is a set of tick options, not free text — mapped to
--     individual checkbox fields.
--   - "OLTC - Service Details" is ~15 blank ruled lines in the source (a writing
--     area) — mapped to a single long_text field, matching how every other form in
--     this app represents an open writing area (e.g. migration 019/062's "Project
--     Details"/"Material Requirement").
--   - "Customer Comments..." (3 numbered blanks) and "Recommended Spares" (6
--     numbered blanks in two columns) are similarly open-ended lists an engineer
--     fills by hand — one long_text field each rather than a fixed number of rigid
--     inputs.
--   - Sign-off follows the "Field Engineer" (not "EMR") naming convention (migration
--     060/062) — the source's static "Email: service@emr.global" line is EMR's own
--     branding/contact, not engineer-entered data, so it isn't represented as a
--     field, matching how migration 062 dropped purely instructional text.
do $$
declare
  v_form_id uuid;
  v_sec_id  uuid;
begin

  delete from public.forms where name = 'OLTC Service MOM';

  insert into public.forms (name, job_type, status, field_count)
  values ('OLTC Service MOM', 'overhauling', 'draft', 39)
  returning id into v_form_id;

  -- ── Section: Visit Details ───────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Visit Details', 1)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer',                'text', true,  true,  false, 1),
    (v_sec_id, 'Date',                    'date', true,  false, false, 2),
    (v_sec_id, 'Site Address',            'text', true,  true,  false, 3),
    (v_sec_id, 'Site Reporting Date',     'date', true,  false, false, 4),
    (v_sec_id, 'Completion Date',         'date', false, false, false, 5),
    (v_sec_id, 'No. of days',             'number', false, false, false, 6),
    (v_sec_id, 'Last Service Date',       'date', false, false, false, 7),
    (v_sec_id, 'Next Due In Operation',   'text', false, false, false, 8),
    (v_sec_id, 'Next Due Date',           'date', false, false, false, 9);

  -- ── Section: Service Classification ──────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Service Classification', 2)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Warranty',             'checkbox', false, false, false, 1),
    (v_sec_id, 'Non-Warranty',         'checkbox', false, false, false, 2),
    (v_sec_id, 'Recoverable',          'checkbox', false, false, false, 3),
    (v_sec_id, 'Non-Recoverable',      'checkbox', false, false, false, 4),
    (v_sec_id, 'Business Opportunity', 'checkbox', false, false, false, 5);

  -- ── Section: OLTC Details ─────────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC Details', 3)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Specification',            'text',   false, false, false, 1),
    (v_sec_id, 'Serial No/Yr. of Mfg',      'text',   false, false, false, 2),
    (v_sec_id, 'Date of Commissioning',     'date',   false, false, false, 3),
    (v_sec_id, 'BDV/ PPM of Oil',           'text',   false, false, false, 4),
    (v_sec_id, 'Resistance',                'text',   false, false, false, 5),
    (v_sec_id, 'Avg. Operations per day',   'number', false, false, false, 6);

  -- ── Section: Transformer Details ─────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Transformer Details', 4)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Make',              'text',     false, false, false, 1),
    (v_sec_id, 'MVA & kV',          'text',     false, false, false, 2),
    (v_sec_id, 'Counter Reading',   'text',     false, false, false, 3),
    (v_sec_id, 'Power Station',     'checkbox', false, false, false, 4),
    (v_sec_id, 'Electrolysis',      'checkbox', false, false, false, 5),
    (v_sec_id, 'Furnace',           'checkbox', false, false, false, 6),
    (v_sec_id, 'Auto Transformer',  'checkbox', false, false, false, 7),
    (v_sec_id, 'Network',           'checkbox', false, false, false, 8);

  -- ── Section: OLTC - Service Details ──────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC - Service Details', 5)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Service Details', 'long_text', false, false, false, 1);

  -- ── Section: Customer Comments, Appreciation & Feedback ──────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Customer Comments, Appreciation & Feedback', 6)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Comments', 'long_text', false, false, false, 1);

  -- ── Section: Recommended Spares ──────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Recommended Spares', 7)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Recommended Spares', 'long_text', false, false, false, 1);

  -- ── Section: Sign-off ─────────────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 8)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',              'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',         'signature', true,  false, false, 2),
    (v_sec_id, 'Customer Phone No.',         'text',      false, true,  false, 3),
    (v_sec_id, 'Customer Email',             'text',      false, false, false, 4),
    (v_sec_id, 'Field Engineer Name',        'text',      true,  true,  false, 5),
    (v_sec_id, 'Field Engineer Signature',   'signature', true,  false, false, 6),
    (v_sec_id, 'Field Engineer Phone No.',   'text',      false, false, false, 7),
    (v_sec_id, 'Field Engineer Email',       'text',      false, false, false, 8);

end $$;
