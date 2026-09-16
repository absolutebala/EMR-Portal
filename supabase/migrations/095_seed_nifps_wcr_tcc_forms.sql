-- Seeds two more NIFPS job forms, transcribed from EMR's source documents
-- (NEW_NIFPS-WCR Work Completion Report; NIFPS Testing and Commissioning
-- Checklist Report). Both status='active' so they appear in the mobile Job forms
-- list. Same conventions as migration 094: standard Customer + Field Engineer
-- sign-off (source's "Easun-MR" column = the field engineer), prefill on
-- Customer/Site/Name/Phone, option rows as checkboxes, standard confirmation
-- statements + Yes/No checklists as yes_no tables (tick + remarks per row).
do $$
declare
  v_form_id uuid;
  v_sec_id  uuid;
  v_tbl_id  uuid;
begin

  delete from public.forms where name in ('NIFPS Work Completion Report', 'NIFPS Testing and Commissioning Report');

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 1: NIFPS Work Completion Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('NIFPS Work Completion Report', 'commissioning_activities', 'active', 31)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Details', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name', 'text', true,  true,  false, 1),
    (v_sec_id, 'Date',          'date', true,  false, false, 2),
    (v_sec_id, 'Site Address',  'text', true,  true,  false, 3);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'NIFPS Details', 2) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Sr. No',              'text',     false, false, false, 1),
    (v_sec_id, 'Single Cylinder',     'checkbox', false, false, false, 2),
    (v_sec_id, 'Double Cylinder',     'checkbox', false, false, false, 3),
    (v_sec_id, 'Date of commissioning', 'date',   false, false, false, 4),
    (v_sec_id, 'Year of Mfg',         'text',     false, false, false, 5),
    (v_sec_id, 'Location: Power Station',      'checkbox', false, false, false, 6),
    (v_sec_id, 'Location: Furnace',            'checkbox', false, false, false, 7),
    (v_sec_id, 'Location: Power Transformer',  'checkbox', false, false, false, 8),
    (v_sec_id, 'Location: Auto transformer',   'checkbox', false, false, false, 9),
    (v_sec_id, 'Location: Inverter Transformer', 'checkbox', false, false, false, 10);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Transformer Details', 3) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Transformer No',        'text', false, false, false, 1),
    (v_sec_id, 'Manufacturer',          'text', false, false, false, 2),
    (v_sec_id, 'Serial Number',         'text', false, false, false, 3),
    (v_sec_id, 'Year of Mfg.',          'text', false, false, false, 4),
    (v_sec_id, 'Rating of Transformer', 'text', false, false, false, 5),
    (v_sec_id, 'KV Class',              'text', false, false, false, 6),
    (v_sec_id, 'Date of Commissioning', 'date', false, false, false, 7);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'NIFPS System Installation and Commissioning / Service details', 4) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, '1', 'Easun MR Representative has reached the site.', 1),
    (v_tbl_id, '2', 'Easun MR Representative has checked the correctness of connections on the NIFPS panel.', 2),
    (v_tbl_id, '3', 'Signal Testing done from Transformer control relay panel to NIFPS panel control panel. All the signals were checked at NIFPS control panel and found OK.', 3),
    (v_tbl_id, '4', 'The working of various modes of operation has been checked and demo of the system has been given to the Customer.', 4),
    (v_tbl_id, '5', 'NIFPS signals Testing and Commissioning has been carried for the mentioned serial number as per Checklist.', 5),
    (v_tbl_id, '6', 'The operation of NIFPS system has been explained to the Customer.', 6),
    (v_tbl_id, '7', 'Easun MR recommended to do AMC for the NIFPS system as per O&M Manual.', 7);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Remarks', 5) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values (v_sec_id, 'Remarks if Any', 'long_text', false, false, false, 1);

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 6) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',              'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Designation',       'text',      false, false, false, 2),
    (v_sec_id, 'Customer Phone No.',         'text',      false, true,  false, 3),
    (v_sec_id, 'Customer Email',             'text',      false, false, false, 4),
    (v_sec_id, 'Customer Signature',         'signature', true,  false, false, 5),
    (v_sec_id, 'Field Engineer Name',        'text',      true,  true,  false, 6),
    (v_sec_id, 'Field Engineer Designation', 'text',      false, false, false, 7),
    (v_sec_id, 'Field Engineer Phone No.',   'text',      false, false, false, 8),
    (v_sec_id, 'Field Engineer Email',       'text',      false, false, false, 9),
    (v_sec_id, 'Field Engineer Signature',   'signature', true,  false, false, 10);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- FORM 2: NIFPS Testing and Commissioning Report
  -- ═══════════════════════════════════════════════════════════════════════════
  insert into public.forms (name, job_type, status, field_count)
  values ('NIFPS Testing and Commissioning Report', 'commissioning_activities', 'active', 20)
  returning id into v_form_id;

  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Report Details', 1) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer',              'text', true,  true,  false, 1),
    (v_sec_id, 'End user',              'text', false, false, false, 2),
    (v_sec_id, 'EMR W.O. No',           'text', false, false, false, 3),
    (v_sec_id, 'Quantity',              'text', false, false, false, 4),
    (v_sec_id, 'Installation Location', 'text', false, true,  false, 5),
    (v_sec_id, 'Project Details, If any', 'text', false, false, false, 6),
    (v_sec_id, 'Transformer Manufacturer', 'text', false, false, false, 7),
    (v_sec_id, 'Rating of Transformer', 'text', false, false, false, 8),
    (v_sec_id, 'Date of Commissioning', 'date', false, false, false, 9),
    (v_sec_id, 'Serial Number',         'text', false, false, false, 10);

  -- I. Before Test
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'I. Checks before test', 2) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, 'a', 'Check if Transformer is in De-Energized state', 1),
    (v_tbl_id, 'b', 'Check if the wiring is done as per the Schematic Diagram', 2),
    (v_tbl_id, 'c', 'Ensure there are no foreign particle / Moisture ingress in any of Arc Sensors', 3),
    (v_tbl_id, 'd', 'Check if the Arc Sensor Gasket and the bolts are tightened properly', 4),
    (v_tbl_id, 'e', 'Check if the O-ring provided on Arc Sensor Head and arc sensor Housing is intact', 5),
    (v_tbl_id, 'f', 'Check if the Arc Sensor cap is properly tightened', 6),
    (v_tbl_id, 'g', 'Check if the Arc Sensor gland is tightened enough', 7),
    (v_tbl_id, 'h', 'Check if the LHD is healthy by checking the continuity', 8),
    (v_tbl_id, 'i', 'Check if the LHD Junction Box top Cover is tightened properly', 9),
    (v_tbl_id, 'j', 'Check if the LHD conduit sealed inside the gland and the gland is tightened in the Junction Box', 10),
    (v_tbl_id, 'k', 'Ensure proper rated Main and Auxiliary supply given via the proper terminal blocks as per the schematic diagram', 11);

  -- II. Shutter Valve
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'II. Shutter Valve', 3) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'The locking of Shutter Valve was checked by turning the Rotary switch to LOCKED position and ensuring whether the signal has been received to the control panel with the help of lamp indication', 1);

  -- III. Signal Box
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'III. Signal Box', 4) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, 'a', 'Check if all Arc Sensors Cables, Shutter Valve Cables and LHD Cable terminated in order as per the Schematic diagram', 1),
    (v_tbl_id, 'b', 'LHD conduit is sealed properly inside the gland and the gland is tightened fully', 2),
    (v_tbl_id, 'c', 'Ensure LHD cable terminated without much strain by ensuring maximum possible bend angle', 3),
    (v_tbl_id, 'd', 'Check if all wires are terminated properly by Pull test', 4);

  -- IV. Control Panel
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'IV. Control Panel', 5) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, 'a', 'Switch ON the panel and carry out visual inspection to ensure all elements in the Panel are working fine', 1),
    (v_tbl_id, 'b', 'Check if the LED indicator sticker circuit is intact by "Lamp test" push button', 2),
    (v_tbl_id, 'c', 'Ensure default lamp indications such as "Power ON", "In Service", "Conservator Shutter Valve open", "Nitrogen Valve closed", "AUTO mode" and "Oil Drain Valve closed" are glowing', 3),
    (v_tbl_id, 'd', 'Check if the HMI (Control Panel Display) Settings page remains Factory setting', 4),
    (v_tbl_id, 'e', 'Ensure the PS1 (wherever applicable) Pressure value is greater than 120 Bar in "System Status" section of HMI', 5),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Conservator Shutter Valve closed (shorting the corresponding TB as per scheme)', 6),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Conservator Shutter Valve Locked (operating the Switch from "In Service" to "Circulation Mode")', 7),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Arc Detection (shorting the corresponding TB as per scheme)', 8),
    (v_tbl_id, 'f', 'LED indicator glowing on input — LHD Activation (shorting the corresponding TB as per scheme)', 9),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Differential Relay Protection', 10),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Restricted Earth fault Relay Protection', 11),
    (v_tbl_id, 'f', 'LED indicator glowing on input — PRV Protection', 12),
    (v_tbl_id, 'f', 'LED indicator glowing on input — Buchholz Relay Protection', 13),
    (v_tbl_id, 'g', 'Functional Test for "DC/AC Supply Fail" lamp Indication by isolating DC/AC Supply to Control box', 14),
    (v_tbl_id, 'h', 'HMI Time / Date Updated', 15);
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'PLC Version', 'text', false, false, false, 2),
    (v_sec_id, 'HMI Version', 'text', false, false, false, 3);

  -- V. Switchyard Cubicle
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'V. Switchyard Cubicle', 6) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, sno_label, row_label, order_index)
  values
    (v_tbl_id, 'a', 'Ensure "System Under Maintenance" LED glowing by inserting the locking rod', 1),
    (v_tbl_id, 'b', 'Ensure the Pressure Regulator Outlet Pressure setting as 4-5 Bar', 2),
    (v_tbl_id, 'c', 'Ensure the lighting is working fine', 3),
    (v_tbl_id, 'd', 'Ensure all wires are terminated properly in ''X5'' junction Box by pull test', 4),
    (v_tbl_id, 'e', 'Ensure Oil Drain Valve latch lever latched in its seat at least for 8mm', 5),
    (v_tbl_id, 'f', 'Ensure 1 inch Cork Gasket in the N2 gate valve top side', 6);

  -- VI. Modes of Operation
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'VI. Modes of Operation', 7) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Prevention Mode — Arc Sensor input given by manually shorting arc Sensor terminals', 1),
    (v_tbl_id, 'Prevention Mode — Any of Transformer Protection inputs given', 2),
    (v_tbl_id, 'Prevention Mode — Circuit Breaker tripped as soon as Arc Sensor input given, then Oil Drain Valve opened and Nitrogen Injection started', 3),
    (v_tbl_id, 'Extinction Mode — LHD input given by manually shorting LHD terminals', 4),
    (v_tbl_id, 'Extinction Mode — Any of Transformer Protection inputs given', 5),
    (v_tbl_id, 'Extinction Mode — Circuit Breaker tripped as soon as LHD input given, then Oil Drain Valve opened and Nitrogen Injection started', 6),
    (v_tbl_id, 'Electrical Manual Mode (Remote) — Selector switch inside the switchyard cubicle turned to manual and push button pressed', 7),
    (v_tbl_id, 'Electrical Manual Mode (Remote) — Circuit Breaker tripped, then Oil Drain Valve opened and Nitrogen Injection started', 8),
    (v_tbl_id, 'Electrical Manual Mode (Local) — Selector switch on control panel turned to manual and push button pressed', 9),
    (v_tbl_id, 'Electrical Manual Mode (Local) — Circuit Breaker tripped, then Oil Drain Valve opened and Nitrogen Injection started', 10),
    (v_tbl_id, 'Manual activation — activation pin released and chain pulled; falling of dead weight verified visually', 11);

  -- General Checks
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'General Checks', 8) returning id into v_sec_id;
  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1) returning id into v_tbl_id;
  insert into public.form_table_rows (table_id, row_label, order_index)
  values
    (v_tbl_id, 'Check if LHD Conduit properly clamped', 1),
    (v_tbl_id, 'Check if all Cable Glands are properly tightened and in touch with armour', 2),
    (v_tbl_id, 'All Screws / Bolts of Piping are properly tightened', 3),
    (v_tbl_id, 'Ensure proper Painting of Oil Drain and Nitrogen pipe line', 4),
    (v_tbl_id, 'Transformer Oil Drain Valve and Nitrogen Injection Valves and isolation Valve above Switchyard Cubicle are open and 1 inch gate valve cork gasket provided', 5),
    (v_tbl_id, 'N2 Cylinder / pipeline check with Soap Oil if any minor Leakages', 6),
    (v_tbl_id, 'Main Nitrogen Cylinder Valve is connected', 7),
    (v_tbl_id, 'Locking rod is removed and put in its holder and the system is "In Service"', 8);

  -- Sign-off
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Sign-off', 9) returning id into v_sec_id;
  insert into public.form_fields
    (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',              'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Designation',       'text',      false, false, false, 2),
    (v_sec_id, 'Customer Signature',         'signature', true,  false, false, 3),
    (v_sec_id, 'Customer Sign-off Date',     'date',      false, false, false, 4),
    (v_sec_id, 'Field Engineer Name',        'text',      true,  true,  false, 5),
    (v_sec_id, 'Field Engineer Designation', 'text',      false, false, false, 6),
    (v_sec_id, 'Field Engineer Signature',   'signature', true,  false, false, 7),
    (v_sec_id, 'Field Engineer Sign-off Date', 'date',    false, false, false, 8);

end $$;
