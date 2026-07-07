-- Recreate NIFPS Division of Works form with new two-party table structure.
-- !! RUN STEP 1 FIRST, then RUN STEP 2 IN A SEPARATE QUERY EXECUTION !!
-- (PostgreSQL requires new enum values to be committed before they can be used.)

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1 — Run this block alone first, then click Run again for STEP 2 below
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'two_party';
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'two_party_exclusive';

ALTER TABLE form_tables
  ADD COLUMN IF NOT EXISTS col1_label TEXT,
  ADD COLUMN IF NOT EXISTS col2_label TEXT;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2 — Run this block in a NEW query execution (after Step 1 is committed)
-- ══════════════════════════════════════════════════════════════════════════════
-- ── Recreate DOW sections 2-5 ─────────────────────────────────────────────────
DO $$
DECLARE
  v_form_id uuid;
  v_sec_id  uuid;
  v_tbl_id  uuid;
BEGIN
  SELECT id INTO v_form_id FROM forms WHERE name = 'NIFPS Division of Works' LIMIT 1;
  IF v_form_id IS NULL THEN RAISE EXCEPTION 'NIFPS Division of Works form not found'; END IF;

  -- Remove old field-based sections 2-5 (Project Details=1 and Signatures=6 stay)
  DELETE FROM form_sections WHERE form_id = v_form_id AND order_index BETWEEN 2 AND 5;

  -- ── Section 2: Scope of Work (two_party_exclusive: EMR vs Customer) ──────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Scope of Work', 2) RETURNING id INTO v_sec_id;

  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'two_party_exclusive', false, 'EMR', 'Customer', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1',  'Supply of Fire Extinguishing Device (FE), Control Panel, Signal Box, HD Cable, Shutter Valve Assy (TCV), ARC sensor, 2 core FS cable', 1, null),
  (v_tbl_id, '2',  'All pipelines and pipe fittings complete with connections, flanges, bends etc. from transformer to FE and from FE to oil pit chamber', 2, null),
  (v_tbl_id, '3',  'FRLS 19 core & 12 core x 1.5 sq.mm armoured cable', 3, null),
  (v_tbl_id, '4',  'Installation, supervision, testing & commissioning of NIFPS system', 4, null),
  (v_tbl_id, '5',  'Civil work for NIFPS plinth, oil pit & firewall, pipe supports, cable tray', 5, null),
  (v_tbl_id, '6',  'Transformer oil drainage, refilling or make-up (oil filtration)', 6, null),
  (v_tbl_id, '7',  'Packing and forwarding', 7, null),
  (v_tbl_id, '8',  'Power supply required for installation at site', 8, null),
  (v_tbl_id, '9',  'Internal transportation / movement of equipment during erection (crane, hydra, etc.)', 9, null),
  (v_tbl_id, '10', 'Separate earthing for NIFPS system', 10, null),
  (v_tbl_id, '11', 'NIFPS control panel SCADA & hiring relay panel', 11, null);

  -- ── Section 3: Design & Engineering (two_party: TTDI vs NIFPS Vendor) ────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Division of Works - Design & Engineering', 3) RETURNING id INTO v_sec_id;

  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'two_party', false, 'TTDI', 'NIFPS Vendor', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1',  'Design, engineering drawings & calculations of NIFPS for transformer', 1, null),
  (v_tbl_id, '2',  'Input details of transformer for NIFPS designing', 2, null),
  (v_tbl_id, '3',  'Calculation for nitrogen gas & oil drain adequacy', 3, null),
  (v_tbl_id, '4',  'Input for sensor / fire detector locations', 4, null),
  (v_tbl_id, '5',  'Pipe size inputs for oil drain & nitrogen injection', 5, null),
  (v_tbl_id, '6',  'Provision for sensor fixing & pipe connections', 6, null),
  (v_tbl_id, '7',  'Ground mounting arrangement & civil work inputs', 7, null),
  (v_tbl_id, '8',  'Cable quantity & termination inputs', 8, null),
  (v_tbl_id, '9',  'Provision for SCADA integration', 9, null),
  (v_tbl_id, '10', 'Communication facility with SCADA (IEC 61850 / MODBUS)', 10, null),
  (v_tbl_id, '11', 'Inputs for FO cables, power & control cables', 11, null),
  (v_tbl_id, '12', 'NIFPS panel & nitrogen cylinder arrangement for civil design', 12, null),
  (v_tbl_id, '13', 'Civil work input details', 13, null),
  (v_tbl_id, '14', 'Technical support for approval of documents', 14, null),
  (v_tbl_id, '15', 'Manual (Installation & O&M) - hard & soft copy', 15, null);

  -- ── Section 4: Manufacturing, Testing & Supply (two_party: TTDI vs NIFPS Vendor) ──
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Division of Works - Manufacturing, Testing & Supply', 4) RETURNING id INTO v_sec_id;

  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'two_party', false, 'TTDI', 'NIFPS Vendor', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1', 'Material to be manufactured as per approved QAP/MQP', 1, null),
  (v_tbl_id, '2', 'Factory acceptance test before dispatch', 2, null),
  (v_tbl_id, '3', 'Preparation & submission of test reports & certificates', 3, null),
  (v_tbl_id, '4', 'Supply of material with accessories, tools & tackles', 4, null),
  (v_tbl_id, '5', 'Material unloading at site', 5, null),
  (v_tbl_id, '6', 'Material storage at site', 6, null),
  (v_tbl_id, '7', 'Supply of commissioning spares & consumables', 7, null);

  -- ── Section 5: Site Installation, Testing & Commissioning (two_party) ────────
  INSERT INTO form_sections (form_id, title, order_index)
  VALUES (v_form_id, 'Division of Works - Site Installation, Testing & Commissioning', 5) RETURNING id INTO v_sec_id;

  INSERT INTO form_tables (section_id, status_type, has_subrows, col1_label, col2_label, order_index)
  VALUES (v_sec_id, 'two_party', false, 'TTDI', 'NIFPS Vendor', 1)
  RETURNING id INTO v_tbl_id;

  INSERT INTO form_table_rows (table_id, sno_label, row_label, order_index, parent_row_id) VALUES
  (v_tbl_id, '1',  'Installation of NIFPS system as per approved drawings', 1, null),
  (v_tbl_id, '2',  'Laying & termination of power & control cables', 2, null),
  (v_tbl_id, '3',  'Installation, testing, commissioning & demo to customer', 3, null),
  (v_tbl_id, '4',  'Integration with SAS system', 4, null),
  (v_tbl_id, '5',  'Service support during warranty period', 5, null),
  (v_tbl_id, '6',  'Training to client (if required)', 6, null),
  (v_tbl_id, '7',  'Supply of nitrogen gas cylinders with valves & accessories', 7, null),
  (v_tbl_id, '8',  'Tools & spares for operation & maintenance', 8, null),
  (v_tbl_id, '9',  'Maintenance tools for cylinders, valves & pipe connections', 9, null),
  (v_tbl_id, '10', 'Civil work execution', 10, null),
  (v_tbl_id, '11', 'Transportation, accommodation & logistics', 11, null),
  (v_tbl_id, '12', 'Safety equipment, PPE & compliance', 12, null),
  (v_tbl_id, '13', 'Safety training as per client/TTDI protocol', 13, null),
  (v_tbl_id, '14', 'Submission of final as-built drawings & manuals', 14, null);

  RAISE NOTICE 'NIFPS Division of Works sections 2-5 recreated successfully.';
END $$;
