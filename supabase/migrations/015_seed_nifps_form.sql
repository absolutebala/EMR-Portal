do $$
declare
  v_form_id uuid;
  v_sec_id  uuid;
begin
  -- Skip if already seeded
  if exists (select 1 from public.forms where name = 'NIFPS Installation – Assessment') then
    return;
  end if;

  -- ── Form ──────────────────────────────────────────────────────────────────
  insert into public.forms (name, job_type, status, field_count, created_at, updated_at)
  values ('NIFPS Installation – Assessment', 'site_inspection', 'active', 88, now(), now())
  returning id into v_form_id;

  -- ── Section 1: Customer & Transformer Details ─────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Customer & Transformer Details', 1) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Customer Name',        'text',  true,  true,  false, 1),
    (v_sec_id, 'Date',                 'date',  true,  true,  false, 2),
    (v_sec_id, 'Phone No.',            'text',  false, true,  false, 3),
    (v_sec_id, 'Site Address',         'text',  true,  true,  false, 4),
    (v_sec_id, 'Rating',               'text',  false, false, false, 5),
    (v_sec_id, 'Year of Manufacture',  'text',  false, false, false, 6),
    (v_sec_id, 'Serial Number',        'text',  false, true,  false, 7),
    (v_sec_id, 'EMR Engineer Name',    'text',  false, true,  false, 8),
    (v_sec_id, 'EMR Engineer Phone',   'text',  false, false, false, 9);

  -- ── Section 2: Oil & N2 Pipe Line Measurement (mm) ────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Oil & Nitrogen Pipe Line Measurement (mm)', 2) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '1-Inch Pipe (a) — Transformer quick drain valve to switch yard cubicle', 'number', false, false, false, 1),
    (v_sec_id, '1-Inch Pipe (b) — Supporting of oil and nitrogen pipe',                  'number', false, false, false, 2),
    (v_sec_id, '3-Inch Pipe (a) — Transformer oil drain valve to switch yard cubicle',   'number', false, false, false, 3),
    (v_sec_id, '3-Inch Pipe (b) — Cubicle panel to oil sump',                            'number', false, false, false, 4),
    (v_sec_id, 'Materials Remarks (Pipe Elbow, T-Joints, Flanges, Fasteners, etc.)',     'long_text', false, false, false, 5);

  -- ── Section 3: Cable Requirements (m) ────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Cable Requirements (meters)', 3) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '2-Core Cable (A) — Individual Arc Sensor to Signal Box',                    'number', false, false, false, 1),
    (v_sec_id, '2-Core Cable (B) — Shutter Valve to Signal Box Interconnection',            'number', false, false, false, 2),
    (v_sec_id, '3-Core Cable (1) — Power supply for NIFPS Control Panel',                  'number', false, false, false, 3),
    (v_sec_id, '19-Core Cable (A) — Switch Yard Cubicle to NIFPS Control Panel',           'number', false, false, false, 4),
    (v_sec_id, '19-Core Cable (B) — NIFPS Control Panel to Transformer C&R Panel',        'number', false, false, false, 5);

  -- ── Section 4: Details to be Observed ────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Details to be Observed', 4) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '(1) Switch yard cubicle panel plinth & oil sump construction status', 'dropdown',  false, false, false, 1),
    (v_sec_id, '(1) Details',                                                         'long_text', false, false, false, 2),
    (v_sec_id, '(2) Arc Sensor window — Length (mm)',                                 'number',    false, false, false, 3),
    (v_sec_id, '(2) Arc Sensor window — Breadth (mm)',                                'number',    false, false, false, 4),
    (v_sec_id, '(2) Arc Sensor window — Height (mm)',                                 'number',    false, false, false, 5),
    (v_sec_id, '(2) Details',                                                         'long_text', false, false, false, 6),
    (v_sec_id, '(3) Sand digging work for 3-inch pipe — status',                      'dropdown',  false, false, false, 7),
    (v_sec_id, '(3) Details',                                                         'long_text', false, false, false, 8),
    (v_sec_id, '(4) Cable routing / trench from switch yard to control room — status','dropdown',  false, false, false, 9),
    (v_sec_id, '(4) Details',                                                         'long_text', false, false, false, 10),
    (v_sec_id, '(5) NIFPS control panel mounting details',                            'long_text', false, false, false, 11),
    (v_sec_id, '(6) Control room construction status',                                'dropdown',  false, false, false, 12),
    (v_sec_id, '(6) Details',                                                         'long_text', false, false, false, 13),
    (v_sec_id, '(7) Customer informed — power source for pipeline fabrication',       'long_text', false, false, false, 14),
    (v_sec_id, '(8) Confirmation — customer informed for pipeline power source',      'long_text', false, false, false, 15);

  -- ── Section 5: Material Requirement ──────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Material Requirement', 5) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '80 NB Pipe GI (m)',                        'number', false, false, false, 1),
    (v_sec_id, '80 NB Flange GI',                          'number', false, false, false, 2),
    (v_sec_id, '80 NB Elbow GI',                           'number', false, false, false, 3),
    (v_sec_id, '80 NB T Joint GI',                         'number', false, false, false, 4),
    (v_sec_id, '80 NB Gasket — 4 Holes',                   'number', false, false, false, 5),
    (v_sec_id, '80 NB U-Bolt with Nut (Set)',               'number', false, false, false, 6),
    (v_sec_id, 'M16 × 80 Bolt, Nut with Washer (Set)',      'number', false, false, false, 7),
    (v_sec_id, 'Support L Angle Plate 300 mm MS',           'number', false, false, false, 8),
    (v_sec_id, 'Support L Angle Plate 200 mm MS',           'number', false, false, false, 9),
    (v_sec_id, 'Anchor Bolt M10 Set',                       'number', false, false, false, 10),
    (v_sec_id, '25 NB Pipe GI (m)',                        'number', false, false, false, 11),
    (v_sec_id, '25 NB Flange GI',                          'number', false, false, false, 12),
    (v_sec_id, '25 NB Elbow GI',                           'number', false, false, false, 13),
    (v_sec_id, '25 NB T Joint GI',                         'number', false, false, false, 14),
    (v_sec_id, '25 NB U-Bolt with Nut (Set)',               'number', false, false, false, 15),
    (v_sec_id, '25 NB Gasket — 4 Holes',                   'number', false, false, false, 16),
    (v_sec_id, 'M12 × 60 Bolt, Nut with Washer (Set)',      'number', false, false, false, 17);

  -- ── Section 6: Retrofitting — Arc Sensors ────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Retrofitting Materials — Arc Sensors Fixing Work', 6) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Retro Arc Sensor Flange Straight with Stud & Nuts', 'number', false, false, false, 1),
    (v_sec_id, 'Retro Arc Sensor Flange Tilt with Stud & Nuts',     'number', false, false, false, 2),
    (v_sec_id, 'Arc Sensors',                                        'number', false, false, false, 3),
    (v_sec_id, 'Arc Sensors Gasket',                                 'number', false, false, false, 4);

  -- ── Section 7: Oil Drain Line Retrofitting ────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Oil Drain Line Retrofitting Materials', 7) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '50 NB Gate Valve',            'number', false, false, false, 1),
    (v_sec_id, '50 NB Pipe (m)',              'number', false, false, false, 2),
    (v_sec_id, 'M16 × 60 Fasteners Set',      'number', false, false, false, 3),
    (v_sec_id, '50 NB Flange',               'number', false, false, false, 4),
    (v_sec_id, '50 NB Gasket',               'number', false, false, false, 5);

  -- ── Section 8: N2 Injection Line Retrofitting ─────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'N2 Injection Line Retrofitting Materials', 8) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '50 NB Gate Valve',                          'number', false, false, false, 1),
    (v_sec_id, '50 NB Flange',                             'number', false, false, false, 2),
    (v_sec_id, '50 NB Gasket',                             'number', false, false, false, 3),
    (v_sec_id, '50 NB Pipe (m)',                            'number', false, false, false, 4),
    (v_sec_id, '80 NB Gate Valve',                          'number', false, false, false, 5),
    (v_sec_id, '80 NB Flange',                             'number', false, false, false, 6),
    (v_sec_id, '80 NB Gasket',                             'number', false, false, false, 7),
    (v_sec_id, '80 NB Pipe (m)',                            'number', false, false, false, 8),
    (v_sec_id, '25 NB Gate Valve',                          'number', false, false, false, 9),
    (v_sec_id, '25 NB Flange',                             'number', false, false, false, 10),
    (v_sec_id, '25 NB Gasket',                             'number', false, false, false, 11),
    (v_sec_id, '25 NB Pipe (m)',                            'number', false, false, false, 12),
    (v_sec_id, '80 NB to 50 NB Reducer',                   'number', false, false, false, 13),
    (v_sec_id, '50 NB to 25 NB Reducer',                   'number', false, false, false, 14),
    (v_sec_id, 'M16 × 60 Fasteners Set (Standard Pack)',   'number', false, false, false, 15),
    (v_sec_id, 'M12 × 60 Fasteners Set (Standard Pack)',   'number', false, false, false, 16);

  -- ── Section 9: Air Release System ────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Air Release System', 9) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Air Releaser with Reducer for 3" Oil Drain Pipe Line',    'number', false, false, false, 1),
    (v_sec_id, 'Air Releaser with Reducer for N2 Pipe Line (1" Pipe)',    'number', false, false, false, 2);

  -- ── Section 10: Cables ────────────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Cables', 10) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '19 Core Cable 1.5 Sq. mm (m)',     'number', false, false, false, 1),
    (v_sec_id, 'LHD Cable (m)',                     'number', false, false, false, 2),
    (v_sec_id, '3 Core Cable 1.5 Sq. mm (m)',       'number', false, false, false, 3),
    (v_sec_id, '2 Core Cable 1.5 Sq. mm FS (m)',    'number', false, false, false, 4);

  -- ── Section 11: Signatures ────────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Signatures', 11) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Customer Name',       'text',      false, false, false, 1),
    (v_sec_id, 'Customer Phone No.',  'text',      false, false, false, 2),
    (v_sec_id, 'Customer Signature',  'signature', false, false, false, 3),
    (v_sec_id, 'EMR Name',            'text',      false, false, false, 4),
    (v_sec_id, 'EMR Phone No.',       'text',      false, false, false, 5),
    (v_sec_id, 'EMR Signature',       'signature', false, false, false, 6);

end $$;
