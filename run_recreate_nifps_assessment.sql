-- Recreate NIFPS Installation – Assessment sections 2, 3 & 4 with new table types.
-- !! RUN STEP 1 FIRST, then RUN STEP 2 IN A SEPARATE QUERY EXECUTION !!
-- (PostgreSQL requires new enum values to be committed before they can be used.)

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1 — Run this block alone first, then click Run again for STEP 2 below
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'observation';
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'measurement';

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2 — Run this block in a NEW query execution (after Step 1 is committed)
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_form_id uuid;
  v_sec_id  uuid;
  v_tbl_id  uuid;
BEGIN
  SELECT id INTO v_form_id FROM forms WHERE name = 'NIFPS Installation - Assessment' LIMIT 1;
  IF v_form_id IS NULL THEN RAISE EXCEPTION 'NIFPS Installation - Assessment form not found'; END IF;

  -- Remove old field-based sections 2, 3, 4 (sections 1, 5-11 stay)
  DELETE FROM form_sections WHERE form_id = v_form_id AND order_index IN (2, 3, 4);

  -- ── Section 2: Oil & Nitrogen Pipe Line Measurement ─────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Oil & Nitrogen Pipe Line Measurement', 2) RETURNING id INTO v_sec_id;

  -- 1-Inch Pipe sub-group
  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'measurement', false, 'mm', '1-Inch Pipe', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, 'a', 'Transformer quick drain valve to switch yard cubicle', 1, null),
  (v_tbl_id, 'b', 'Supporting of oil and nitrogen pipe',                   2, null);

  -- 3-Inch Pipe sub-group
  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'measurement', false, 'mm', '3-Inch Pipe', 2)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, 'a', 'Transformer oil drain valve to switch yard cubicle', 1, null),
  (v_tbl_id, 'b', 'Cubicle panel to oil sump',                          2, null);

  -- Materials remarks field (pipe elbow, T-joints, flanges, fasteners, etc.)
  INSERT INTO form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  VALUES (v_sec_id, 'Materials Remarks (Pipe Elbow, T-Joints, Flanges, Fasteners, etc.)', 'long_text', false, false, false, 3);

  -- ── Section 3: Cable Requirements ───────────────────────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Cable Requirements', 3) RETURNING id INTO v_sec_id;

  -- 2-Core Cable sub-group
  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'measurement', false, 'm', '2-Core Cable', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, 'A', 'Individual Arc Sensor to Signal Box',          1, null),
  (v_tbl_id, 'B', 'Shutter Valve to Signal Box Interconnection',  2, null);

  -- 3-Core Cable sub-group
  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'measurement', false, 'm', '3-Core Cable', 2)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1', 'Power supply for NIFPS Control Panel', 1, null);

  -- 19-Core Cable sub-group
  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'measurement', false, 'm', '19-Core Cable', 3)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, 'A', 'Switch Yard Cubicle to NIFPS Control Panel',      1, null),
  (v_tbl_id, 'B', 'NIFPS Control Panel to Transformer C&R Panel',    2, null);

  -- ── Section 4: Details to be Observed ───────────────────────────────────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Details to be Observed', 4) RETURNING id INTO v_sec_id;

  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'observation', false, null, null, 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1', 'Switch yard cubicle panel plinth & oil sump construction status',              1, null),
  (v_tbl_id, '2', 'Arc Sensor window dimensions — Length, Breadth & Height (mm)',                 2, null),
  (v_tbl_id, '3', 'Sand digging work for 3-inch pipe',                                            3, null),
  (v_tbl_id, '4', 'Cable routing / trench from switch yard to control room',                      4, null),
  (v_tbl_id, '5', 'NIFPS control panel mounting details',                                         5, null),
  (v_tbl_id, '6', 'Control room construction status',                                             6, null),
  (v_tbl_id, '7', 'Customer informed — power source required for pipeline fabrication at site',   7, null),
  (v_tbl_id, '8', 'Confirmation — customer acknowledgement for pipeline power source',            8, null);

  RAISE NOTICE 'NIFPS Installation – Assessment sections 2, 3, 4 recreated successfully.';
END $$;
