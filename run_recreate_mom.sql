-- Recreate MOM form with correct content from prototype
-- Run in the correct Supabase project SQL editor.
-- Safe: deletes and recreates all MOM sections / fields / tables / rows.

DO $$
DECLARE
  v_form_id   uuid := '7326c2a9-f4e8-4a0f-9717-0e1f7f41e7ce';
  v_sec1      uuid;
  v_sec2      uuid;
  v_sec3      uuid;
  v_sec4      uuid;
  v_sec5      uuid;
  v_tbl3      uuid;
  v_tbl4      uuid;
  v_par1      uuid;
  v_par2      uuid;
BEGIN
  -- Clear existing sections (cascades to form_fields, form_tables, form_table_rows)
  DELETE FROM form_sections WHERE form_id = v_form_id;

  -- Reset form header
  UPDATE forms SET
    name       = 'MOM',
    job_type   = 'site_inspection',
    status     = 'active',
    field_count = 36,
    updated_at = now()
  WHERE id = v_form_id;

  -- ── Section 1: Customer Information ──────────────────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Customer Information', 1)
  RETURNING id INTO v_sec1;

  INSERT INTO form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) VALUES
  (v_sec1, 'Customer Name',         'text',      true,  true,  true,  1),
  (v_sec1, 'Contact Number',        'text',      true,  true,  true,  2),
  (v_sec1, 'Installation Location', 'text',      true,  true,  true,  3),
  (v_sec1, 'Project Details',       'long_text', false, false, false, 4);

  -- ── Section 2: Transformer Details ───────────────────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Transformer Details', 2)
  RETURNING id INTO v_sec2;

  INSERT INTO form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) VALUES
  (v_sec2, 'NIFPS Serial No.',      'text', true,  true,  true,  1),
  (v_sec2, 'Rating of Transformer', 'text', true,  true,  true,  2),
  (v_sec2, 'Manufacturer',          'text', false, true,  true,  3),
  (v_sec2, 'Site Address',          'text', false, true,  true,  4),
  (v_sec2, 'Date of Installation',  'date', true,  false, false, 5),
  (v_sec2, 'Duration',              'text', true,  false, false, 6);

  -- ── Section 3: Detailed Observations & Activity Status (yes_no table) ────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Detailed Observations & Activity Status', 3)
  RETURNING id INTO v_sec3;

  INSERT INTO form_tables (section_id, status_type, has_subrows, order_index)
  VALUES (v_sec3, 'yes_no', false, 1)
  RETURNING id INTO v_tbl3;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl3, '1', 'Verification of switchyard cubicle panel erection was carried out',                       1, null),
  (v_tbl3, '2', 'Verification of signal box erection was carried out',                                    2, null),
  (v_tbl3, '3', 'Verification of control panel erection was carried out',                                 3, null),
  (v_tbl3, '4', 'Inspection of shutter valve erection along with cabling and termination was carried out', 4, null),
  (v_tbl3, '5', 'Inspection of arc sensor fixing, cabling and termination was carried out',               5, null),
  (v_tbl3, '6', 'Support pipe grouting work (under customer civil scope) was reviewed',                   6, null),
  (v_tbl3, '7', 'LHD cable laying with conduit was checked',                                              7, null);

  -- ── Section 4: Pre-Commissioning Checklist (tested_not_tested + sub-rows) ─
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Pre-Commissioning Checklist', 4)
  RETURNING id INTO v_sec4;

  INSERT INTO form_tables (section_id, status_type, has_subrows, order_index)
  VALUES (v_sec4, 'tested_not_tested', true, 1)
  RETURNING id INTO v_tbl4;

  -- 1. Earthing (parent) → sub-rows (a) (b) (c)
  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id)
  VALUES (v_tbl4, '1', 'Earthing of the below switchyard equipment is to be verified', 1, null)
  RETURNING id INTO v_par1;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl4, '(a)', 'Cubicle panel', 2, v_par1),
  (v_tbl4, '(b)', 'Control panel', 3, v_par1),
  (v_tbl4, '(c)', 'Signal box',    4, v_par1);

  -- 2. Potential-free contact (parent) → sub-rows (a)–(e)
  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id)
  VALUES (v_tbl4, '2', 'Potential-free contact assigned with the main protection relay was configured', 5, null)
  RETURNING id INTO v_par2;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl4, '(a)', 'Differential Protection Input (NO)',        6,  v_par2),
  (v_tbl4, '(b)', 'PRV Trip – (1) & (2) (NO)',                7,  v_par2),
  (v_tbl4, '(c)', 'Buchholz Trip (NO)',                       8,  v_par2),
  (v_tbl4, '(d)', 'Master Trip Feedback – 86 Relay (NO)',     9,  v_par2),
  (v_tbl4, '(e)', 'Master Relay Trip Command – 110V / 220V',  10, v_par2);

  -- 3. AC supply (standalone)
  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id)
  VALUES (v_tbl4, '3', 'AC supply availability was verified in control panel', 11, null);

  -- 4. DC cable (standalone)
  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id)
  VALUES (v_tbl4, '4', 'DC cable availability was verified in control panel', 12, null);

  -- ── Section 5: Customer Sign-off ─────────────────────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Customer Sign-off', 5)
  RETURNING id INTO v_sec5;

  INSERT INTO form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) VALUES
  (v_sec5, 'Customer Name',     'text',      true,  false, false, 1),
  (v_sec5, 'Designation',       'text',      false, false, false, 2),
  (v_sec5, 'Digital Signature', 'signature', true,  false, false, 3);

  RAISE NOTICE 'MOM form recreated successfully.';
END $$;
