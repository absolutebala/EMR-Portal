-- Seeds four new job forms, transcribed verbatim from EMR's source documents
-- (MOM_Report, Overhauling_MOM_Report, Smart Breather Site Inspection Report,
-- EMR Incident Report). All created status='active' so they appear immediately in
-- the mobile "Job forms" list on every notification (the list shows every active
-- form regardless of job_type).
--
-- Conventions (same as migration 078's OLTC Service MOM):
--   - Sign-off uses the standard "Customer" + "Field Engineer" naming (the source
--     docs' "EMR" / "Site Engineer" column = the field engineer). The engineer +
--     customer signature fields are what let a submitted form auto-close the
--     notification (see submitJobFormCore's *_SIGNATURE_LABEL match).
--   - prefill_from_job on the fields the app can auto-fill from the notification
--     (Customer, Site Address, Customer Name/Phone, Field Engineer Name).
--   - Mutually-selected option rows (Warranty / winding config / protection type,
--     etc.) are individual checkbox fields the engineer ticks — same as 078.
--   - "Observation/Remarks" check-point tables use status_type 'observation'
--     (free-text per row); Pass/Fail uses a two-column table; the Overhauling
--     narrative's 10 standard steps are a yes_no table (tick + remarks per step).
do $$
declare
  v_form_id uuid;
  v_sec_id  uuid;
  v_tbl_id  uuid;
begin

  -- Idempotent re-seed
  delete from public.forms where name in (
    'MOM Report', 'Overhauling MOM Report',
    'Smart Breather Site Inspection Report', 'Incident Report'
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 1: MOM Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('MOM Report', 'overhauling', 'active', 30)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Visit Details', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer',              'text',   true,  true,  false, 1),
    (v_sec_id, 'Date',                  'date',   true,  false, false, 2),
    (v_sec_id, 'Site Address',          'text',   true,  true,  false, 3),
    (v_sec_id, 'Site Reporting Date',   'date',   false, false, false, 4),
    (v_sec_id, 'Completion Date',       'date',   false, false, false, 5),
    (v_sec_id, 'No. of days',           'number', false, false, false, 6),
    (v_sec_id, 'Last Service Date',     'date',   false, false, false, 7),
    (v_sec_id, 'Next Due In Operation', 'text',   false, false, false, 8),
    (v_sec_id, 'Next Due Date',         'date',   false, false, false, 9);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Classification', 2) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Warranty',             'checkbox', false, false, false, 1),
    (v_sec_id, 'Recoverable',          'checkbox', false, false, false, 2),
    (v_sec_id, 'Business Opportunity', 'checkbox', false, false, false, 3);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC Details', 3) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Specification',   'text', false, false, false, 1),
    (v_sec_id, 'Serial No',       'text', false, false, false, 2),
    (v_sec_id, 'Year of Mfg',     'text', false, false, false, 3),
    (v_sec_id, 'Resistance',      'text', false, false, false, 4),
    (v_sec_id, 'Counter Reading', 'text', false, false, false, 5);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Transformer Details', 4) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Make',            'text', false, false, false, 1),
    (v_sec_id, 'Sl. No',          'text', false, false, false, 2),
    (v_sec_id, 'Rating (MVA/KV)', 'text', false, false, false, 3);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC - Service Details', 5) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values (v_sec_id, 'Service Details', 'long_text', false, false, false, 1);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Recommended Spares', 6) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values (v_sec_id, 'Recommended Spares', 'long_text', false, false, false, 1);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 7) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',            'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',       'signature', true,  false, false, 2),
    (v_sec_id, 'Customer Phone No.',       'text',      false, true,  false, 3),
    (v_sec_id, 'Customer Email',           'text',      false, false, false, 4),
    (v_sec_id, 'Field Engineer Name',      'text',      true,  true,  false, 5),
    (v_sec_id, 'Field Engineer Signature', 'signature', true,  false, false, 6),
    (v_sec_id, 'Field Engineer Phone No.', 'text',      false, false, false, 7),
    (v_sec_id, 'Field Engineer Email',     'text',      false, false, false, 8);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 2: Overhauling MOM Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('Overhauling MOM Report', 'overhauling', 'active', 30)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Visit Details', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer',              'text',   true,  true,  false, 1),
    (v_sec_id, 'Date',                  'date',   true,  false, false, 2),
    (v_sec_id, 'Site Address',          'text',   true,  true,  false, 3),
    (v_sec_id, 'Site Reporting Date',   'date',   false, false, false, 4),
    (v_sec_id, 'Completion Date',       'date',   false, false, false, 5),
    (v_sec_id, 'No. of days',           'number', false, false, false, 6),
    (v_sec_id, 'Last Service Date',     'date',   false, false, false, 7),
    (v_sec_id, 'Next Due In Operation', 'text',   false, false, false, 8),
    (v_sec_id, 'Next Due Date',         'date',   false, false, false, 9);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Classification', 2) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Warranty',             'checkbox', false, false, false, 1),
    (v_sec_id, 'Recoverable',          'checkbox', false, false, false, 2),
    (v_sec_id, 'Business Opportunity', 'checkbox', false, false, false, 3);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC Details', 3) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Specification',   'text', false, false, false, 1),
    (v_sec_id, 'Serial No',       'text', false, false, false, 2),
    (v_sec_id, 'Year of Mfg',     'text', false, false, false, 3),
    (v_sec_id, 'Resistance',      'text', false, false, false, 4),
    (v_sec_id, 'Counter Reading', 'text', false, false, false, 5);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Transformer Details', 4) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Make',            'text', false, false, false, 1),
    (v_sec_id, 'Sl. No',          'text', false, false, false, 2),
    (v_sec_id, 'Rating (MVA/KV)', 'text', false, false, false, 3);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'OLTC - Service Details', 5) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, help_text, order_index)
  values
    (v_sec_id, 'OLTC Sl. No.', 'text', false, false, false,
     'EMR Engineer visited the site regarding inspection and rectification of OLTC.', 1);
  -- Standard overhauling steps — engineer confirms each (Yes/No) and adds remarks.
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 2) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, '1',  'Lifted the diverter switch from the DOVA chamber and cleaned with fresh oil.', 1),
    (v_tbl_id, '2',  'The DOVA contacts were inspected and found satisfactory.', 2),
    (v_tbl_id, '3',  'The diverter switch was odd and even continuity checks found Ok.', 3),
    (v_tbl_id, '4',  'After inspection of the diverter switch the resistance is measured and found satisfactory.', 4),
    (v_tbl_id, '5',  'The diverter switch is operated manually and the operation was found satisfactory.', 5),
    (v_tbl_id, '6',  'Then the diverter switch is re-installed into the chamber and filled with new oil (65kv BDV).', 6),
    (v_tbl_id, '7',  'Bevel Gear have applied Grease and found satisfactory.', 7),
    (v_tbl_id, '8',  'Synchronizing is checked between the Drive mechanism and OLTC it was found satisfactory.', 8),
    (v_tbl_id, '9',  'The drive mechanism is operated by manually & electrically it was found satisfactory.', 9),
    (v_tbl_id, '10', 'The final Transformer charge in load.', 10);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Recommended Spares', 6) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values (v_sec_id, 'Recommended Spares', 'long_text', false, false, false, 1);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 7) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',            'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',       'signature', true,  false, false, 2),
    (v_sec_id, 'Customer Phone No.',       'text',      false, true,  false, 3),
    (v_sec_id, 'Customer Email',           'text',      false, false, false, 4),
    (v_sec_id, 'Field Engineer Name',      'text',      true,  true,  false, 5),
    (v_sec_id, 'Field Engineer Signature', 'signature', true,  false, false, 6),
    (v_sec_id, 'Field Engineer Phone No.', 'text',      false, false, false, 7),
    (v_sec_id, 'Field Engineer Email',     'text',      false, false, false, 8);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 3: Smart Breather Site Inspection Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('Smart Breather Site Inspection Report', 'site_inspection', 'active', 28)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Job & Installation Information', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Smart Breather Serial No.',                              'text', false, false, false, 1),
    (v_sec_id, 'Substation/Location',                                    'text', false, true,  false, 2),
    (v_sec_id, 'Transformer Rating/Make',                                'text', false, false, false, 3),
    (v_sec_id, 'Transformer Serial No.',                                 'text', false, false, false, 4),
    (v_sec_id, 'Date of Inspection',                                     'date', false, false, false, 5),
    (v_sec_id, 'Inspected By',                                           'text', false, true,  false, 6),
    (v_sec_id, 'Witnessed By',                                           'text', false, false, false, 7),
    (v_sec_id, 'Transformer with Air cell / Free Breathing',             'text', false, false, false, 8),
    (v_sec_id, 'PPM recorded before Smart Breather and most recent measurement', 'text', false, false, false, 9),
    (v_sec_id, 'Installation',                                           'checkbox', false, false, false, 10),
    (v_sec_id, 'Pre-Commissioning Stage',                               'checkbox', false, false, false, 11),
    (v_sec_id, 'Commissioning',                                          'checkbox', false, false, false, 12),
    (v_sec_id, 'Troubleshooting Visit',                                  'checkbox', false, false, false, 13);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '1. Visual Inspection', 2) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'observation', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Breather Electrically isolated from Transformer', 1),
    (v_tbl_id, 'Separate Earthing available', 2),
    (v_tbl_id, 'Mounting arrangement/Corrosion status', 3),
    (v_tbl_id, 'Leakage points in Transformer if any', 4),
    (v_tbl_id, 'Silica Gel level', 5),
    (v_tbl_id, 'Silica gel condition (Natural white/Pale white)', 6);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '2. Piping & Air Circuit Inspection', 3) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'observation', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Conservator to Breather connection', 1),
    (v_tbl_id, 'Air piping and flanges properly tightened', 2),
    (v_tbl_id, 'No leakage observed', 3),
    (v_tbl_id, 'Flexible hoses in good condition', 4);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '3. Electrical Inspection', 4) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'observation', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Voltage protection relay (+110/-85%)', 1),
    (v_tbl_id, 'Supply voltage 230V (+10/-15%)', 2),
    (v_tbl_id, 'Fuse/MCB/SMPS', 3),
    (v_tbl_id, 'Phase to Neutral', 4),
    (v_tbl_id, 'Earth to Neutral', 5),
    (v_tbl_id, 'Source of supply', 6),
    (v_tbl_id, 'Supply Frequency', 7),
    (v_tbl_id, 'Heater Resistance', 8),
    (v_tbl_id, 'Solenoid Valve Functional Test', 9),
    (v_tbl_id, 'Fan running status', 10),
    (v_tbl_id, 'All Solenoid Valves and Fan supply male-female plugs are connected', 11);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '4. Communication Inspection', 5) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'observation', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Ethernet communication (Ping test / Web page is accessible)', 1),
    (v_tbl_id, 'SCADA Integration If Required', 2);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '5. Functional Test', 6) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  values (v_sec_id, 'two_party_exclusive', false, 'Pass', 'Fail', 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Automatic Mode', 1),
    (v_tbl_id, 'Heater Operation Verified', 2),
    (v_tbl_id, 'Fan Operation Verified', 3),
    (v_tbl_id, 'Moisture Reduction Observed (In web page)', 4),
    (v_tbl_id, 'Manual Push Button Operation test', 5);
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, help_text, order_index)
  values
    (v_sec_id, 'Note', 'long_text', false, false, false,
     'Manual Push Button will not be functional if the actual measured Humidity value is less than the worst-case value. If this needs to be simulated at site, adjust the Worst-case value setting so it is more than the actual %RH read by the Humidity Sensor.', 2);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '6. Inspection Findings & LED Indication', 7) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'LED Indication Status Check', 'long_text', false, false, false, 1),
    (v_sec_id, 'Inspection Findings',         'long_text', false, false, false, 2);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '7. Photographs', 8) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Smart Breather Front View', 'photo', false, false, false, 1),
    (v_sec_id, 'Electrical Connections',    'photo', false, false, false, 2),
    (v_sec_id, 'Conservator Connection',    'photo', false, false, false, 3),
    (v_sec_id, 'Separate Earthing',         'photo', false, false, false, 4),
    (v_sec_id, 'Display/Sensor Readings',   'photo', false, false, false, 5);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, '8. Final Assessment / Recommendations of Spares', 9) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values (v_sec_id, 'Final Assessment / Recommendations of Spares', 'long_text', false, false, false, 1);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 10) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',            'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',       'signature', true,  false, false, 2),
    (v_sec_id, 'Customer Phone No.',       'text',      false, true,  false, 3),
    (v_sec_id, 'Field Engineer Name',      'text',      true,  true,  false, 4),
    (v_sec_id, 'Field Engineer Signature', 'signature', true,  false, false, 5),
    (v_sec_id, 'Date',                     'date',      false, false, false, 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 4: Incident Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('Incident Report', 'overhauling', 'active', 90)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Service Engineer', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Service Engineer Name', 'text', true, true,  false, 1),
    (v_sec_id, 'Date',                  'date', true, false, false, 2);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Transformer Details', 2) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Manufacturer',              'text',     false, false, false, 1),
    (v_sec_id, 'Serial No',                 'text',     false, false, false, 2),
    (v_sec_id, 'Power station',             'checkbox', false, false, false, 3),
    (v_sec_id, 'Network',                   'checkbox', false, false, false, 4),
    (v_sec_id, 'Furnace',                   'checkbox', false, false, false, 5),
    (v_sec_id, 'Electrolysis',              'checkbox', false, false, false, 6),
    (v_sec_id, 'Power (MVA)',               'text',     false, false, false, 7),
    (v_sec_id, 'Load %',                    'text',     false, false, false, 8),
    (v_sec_id, 'Current (A)',               'text',     false, false, false, 9),
    (v_sec_id, 'Um (kV)',                   'text',     false, false, false, 10),
    (v_sec_id, 'Y',                         'checkbox', false, false, false, 11),
    (v_sec_id, 'Delta (HV)',                'checkbox', false, false, false, 12),
    (v_sec_id, 'Delta (LV)',                'checkbox', false, false, false, 13),
    (v_sec_id, 'Autotransformer',           'checkbox', false, false, false, 14),
    (v_sec_id, 'Intermediate circuit',      'checkbox', false, false, false, 15),
    (v_sec_id, 'Y-point insulated',         'checkbox', false, false, false, 16),
    (v_sec_id, 'Y-point ground',            'checkbox', false, false, false, 17),
    (v_sec_id, 'Y-point other',             'checkbox', false, false, false, 18),
    (v_sec_id, 'Date of commissioning',     'date',     false, false, false, 19);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Tap Changer Details', 3) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Type',                        'text', false, false, false, 1),
    (v_sec_id, 'Serial No',                   'text', false, false, false, 2),
    (v_sec_id, 'Actual number of operations', 'text', false, false, false, 3),
    (v_sec_id, 'Last inspection date',        'date', false, false, false, 4),
    (v_sec_id, 'Number of operations',        'text', false, false, false, 5),
    (v_sec_id, 'Carried out by',              'text', false, false, false, 6),
    (v_sec_id, 'Last oil replacement date',   'date', false, false, false, 7),
    (v_sec_id, 'BDV at replacement (KV/2.5mm)', 'text', false, false, false, 8),
    (v_sec_id, 'No. of operations per day',   'text', false, false, false, 9);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Description of Incident', 4) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Description',                    'long_text', false, false, false, 1),
    (v_sec_id, 'Incident date',                 'date',      false, false, false, 2),
    (v_sec_id, 'Hour',                          'text',      false, false, false, 3),
    (v_sec_id, 'During tap change',             'checkbox',  false, false, false, 4),
    (v_sec_id, 'From position',                 'text',      false, false, false, 5),
    (v_sec_id, 'To position',                   'text',      false, false, false, 6),
    (v_sec_id, 'Last op. from',                 'text',      false, false, false, 7),
    (v_sec_id, 'Last op. to',                   'text',      false, false, false, 8),
    (v_sec_id, 'Last op. date',                 'date',      false, false, false, 9),
    (v_sec_id, 'Last op. hour',                 'text',      false, false, false, 10),
    (v_sec_id, 'Position on tap changer head', 'text',      false, false, false, 11),
    (v_sec_id, 'On motor drive unit',           'text',      false, false, false, 12),
    (v_sec_id, 'Buchholz alarm',                'checkbox',  false, false, false, 13),
    (v_sec_id, 'Buchholz tripping',             'checkbox',  false, false, false, 14),
    (v_sec_id, 'Differential protection',       'checkbox',  false, false, false, 15),
    (v_sec_id, 'Qualitral (transformer)',       'checkbox',  false, false, false, 16),
    (v_sec_id, 'Distance protection',           'checkbox',  false, false, false, 17),
    (v_sec_id, 'Over current protection',       'checkbox',  false, false, false, 18),
    (v_sec_id, 'Over voltage protection',       'checkbox',  false, false, false, 19),
    (v_sec_id, 'Lightning arrester',            'checkbox',  false, false, false, 20),
    (v_sec_id, 'Arrester counter reading',      'text',      false, false, false, 21),
    (v_sec_id, 'Fault recorder records',        'text',      false, false, false, 22);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Protective Devices of the Tap Changer', 5) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'DW 2000',                                    'checkbox',  false, false, false, 1),
    (v_sec_id, 'Qualitrol',                                  'checkbox',  false, false, false, 2),
    (v_sec_id, 'RS 1000',                                    'checkbox',  false, false, false, 3),
    (v_sec_id, 'RS 2001',                                    'checkbox',  false, false, false, 4),
    (v_sec_id, 'Flap after incident: ON',                    'checkbox',  false, false, false, 5),
    (v_sec_id, 'Flap after incident: OFF',                   'checkbox',  false, false, false, 6),
    (v_sec_id, 'Inclination of pipe (relay to conservator)', 'text',      false, false, false, 7),
    (v_sec_id, 'Sketch / photo notes',                       'long_text', false, false, false, 8),
    (v_sec_id, 'Conservators together',                      'checkbox',  false, false, false, 9),
    (v_sec_id, 'Conservators separate',                      'checkbox',  false, false, false, 10),
    (v_sec_id, 'Oil contact w/ atmosphere: together',        'checkbox',  false, false, false, 11),
    (v_sec_id, 'Oil contact w/ atmosphere: separate',        'checkbox',  false, false, false, 12),
    (v_sec_id, 'Silica gel / pressure valve / nitrogen (setting value)', 'text', false, false, false, 13),
    (v_sec_id, 'Flap valve: Left',                           'checkbox',  false, false, false, 14),
    (v_sec_id, 'Flap valve: Center',                         'checkbox',  false, false, false, 15),
    (v_sec_id, 'Dimension of valve opening',                 'text',      false, false, false, 16),
    (v_sec_id, 'Tripping: HV circuit break',                 'checkbox',  false, false, false, 17),
    (v_sec_id, 'Tripping: other',                            'checkbox',  false, false, false, 18),
    (v_sec_id, 'Oil filter installed',                       'checkbox',  false, false, false, 19),
    (v_sec_id, 'Operating pressure on gauge (bar)',          'text',      false, false, false, 20);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Data of Network and Substation', 6) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'HV side: Cable',         'checkbox', false, false, false, 1),
    (v_sec_id, 'HV side: Overhead line', 'checkbox', false, false, false, 2),
    (v_sec_id, 'HV side: Other',         'checkbox', false, false, false, 3),
    (v_sec_id, 'LV side: Cable',         'checkbox', false, false, false, 4),
    (v_sec_id, 'LV side: Overhead line', 'checkbox', false, false, false, 5),
    (v_sec_id, 'LV side: Other',         'checkbox', false, false, false, 6);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Additional Information', 7) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Irregularities noticed before the incident', 'long_text', false, false, false, 1),
    (v_sec_id, 'Further circumstances known',                'long_text', false, false, false, 2),
    (v_sec_id, 'Steps taken directly after the incident',    'long_text', false, false, false, 3),
    (v_sec_id, 'Dielectric strength (kV/2.5mm)',             'text',      false, false, false, 4),
    (v_sec_id, 'Water content (ppm)',                        'text',      false, false, false, 5),
    (v_sec_id, 'Oil temp. during sampling (deg C)',          'text',      false, false, false, 6),
    (v_sec_id, 'Results of tap changer check',               'long_text', false, false, false, 7),
    (v_sec_id, 'Photograph notes (if damaged)',              'long_text', false, false, false, 8);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 8) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',            'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',       'signature', true,  false, false, 2),
    (v_sec_id, 'Field Engineer Name',      'text',      true,  true,  false, 3),
    (v_sec_id, 'Field Engineer Signature', 'signature', true,  false, false, 4);

end $$;
