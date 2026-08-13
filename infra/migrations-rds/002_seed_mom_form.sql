-- Seed the MOM (Minutes of Meeting) form
do $$
declare
  v_form_id uuid;
  v_sec1_id uuid; v_sec2_id uuid; v_sec3_id uuid; v_sec4_id uuid; v_sec5_id uuid;
  v_table3_id uuid; v_table4_id uuid;
  v_row1_id uuid; v_row2_id uuid;
begin

-- Create form
insert into public.forms (name, job_type, status, field_count)
values ('MOM', 'commissioning_activities', 'active', 36)
returning id into v_form_id;

-- Section 1: Customer Information
insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Customer Information', 1) returning id into v_sec1_id;
insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, order_index) values
  (v_sec1_id, 'Customer Name', 'text', true, true, 1),
  (v_sec1_id, 'Contact Number', 'text', true, true, 2),
  (v_sec1_id, 'Installation Location', 'text', true, true, 3),
  (v_sec1_id, 'Project Details', 'long_text', false, false, 4);

-- Section 2: Transformer Details
insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Transformer Details', 2) returning id into v_sec2_id;
insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, order_index) values
  (v_sec2_id, 'NIFPS Serial No.', 'text', false, true, 1),
  (v_sec2_id, 'Rating', 'text', false, true, 2),
  (v_sec2_id, 'Manufacturer', 'text', false, true, 3),
  (v_sec2_id, 'Site Address', 'text', false, true, 4),
  (v_sec2_id, 'Date of Installation', 'date', true, false, 5),
  (v_sec2_id, 'Duration', 'text', true, false, 6);

-- Section 3: Detailed Observations — table block yes_no
insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Detailed Observations & Activity Status', 3) returning id into v_sec3_id;
insert into public.form_tables (section_id, status_type, has_subrows, order_index) values (v_sec3_id, 'yes_no', false, 1) returning id into v_table3_id;
insert into public.form_table_rows (table_id, row_label, sno_label, order_index) values
  (v_table3_id, 'Verification of switchyard cubicle panel erection was carried out', '1', 1),
  (v_table3_id, 'Verification of signal box erection was carried out', '2', 2),
  (v_table3_id, 'Verification of control panel erection was carried out', '3', 3),
  (v_table3_id, 'Inspection of shutter valve erection along with cabling and termination was carried out', '4', 4),
  (v_table3_id, 'Inspection of arc sensor fixing, cabling and termination was carried out', '5', 5),
  (v_table3_id, 'Support pipe grouting work (under customer civil scope) was reviewed', '6', 6),
  (v_table3_id, 'LHD cable laying with conduit was checked', '7', 7);

-- Section 4: Pre-Commissioning Checklist — tested_not_tested with subrows
insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Pre-Commissioning Checklist', 4) returning id into v_sec4_id;
insert into public.form_tables (section_id, status_type, has_subrows, order_index) values (v_sec4_id, 'tested_not_tested', true, 1) returning id into v_table4_id;

-- Row 1
insert into public.form_table_rows (table_id, row_label, sno_label, order_index) values
  (v_table4_id, 'Earthing of the below switchyard equipment is to be verified', '1', 1) returning id into v_row1_id;
insert into public.form_table_rows (table_id, parent_row_id, row_label, sno_label, order_index) values
  (v_table4_id, v_row1_id, 'Cubicle panel', '(a)', 2),
  (v_table4_id, v_row1_id, 'Control panel', '(b)', 3),
  (v_table4_id, v_row1_id, 'Signal box', '(c)', 4);

-- Row 2
insert into public.form_table_rows (table_id, row_label, sno_label, order_index) values
  (v_table4_id, 'Potential-free contact assigned with the main protection relay was configured', '2', 5) returning id into v_row2_id;
insert into public.form_table_rows (table_id, parent_row_id, row_label, sno_label, order_index) values
  (v_table4_id, v_row2_id, 'Differential Protection Input (NO)', '(a)', 6),
  (v_table4_id, v_row2_id, 'PRV Trip – (1) & (2) (NO)', '(b)', 7),
  (v_table4_id, v_row2_id, 'Buchholz Trip (NO)', '(c)', 8),
  (v_table4_id, v_row2_id, 'Master Trip Feedback – 86 Relay (NO)', '(d)', 9),
  (v_table4_id, v_row2_id, 'Master Relay Trip Command – 110V / 220V', '(e)', 10);

-- Rows 3 and 4 (no sub-rows)
insert into public.form_table_rows (table_id, row_label, sno_label, order_index) values
  (v_table4_id, 'AC supply availability was verified in control panel', '3', 11),
  (v_table4_id, 'DC cable availability was verified in control panel', '4', 12);

-- Section 5: Customer Sign-off
insert into public.form_sections (form_id, title, order_index) values (v_form_id, 'Customer Sign-off', 5) returning id into v_sec5_id;
insert into public.form_fields (section_id, label, field_type, is_required, order_index) values
  (v_sec5_id, 'Customer Name', 'text', true, 1),
  (v_sec5_id, 'Designation', 'text', false, 2),
  (v_sec5_id, 'Digital Signature', 'signature', true, 3);

end $$;
