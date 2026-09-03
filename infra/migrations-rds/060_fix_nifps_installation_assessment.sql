-- Corrects the "NIFPS Installation - Assessment" form seeded in migration 059:
--  1. Row text for the material/cable list tables had unit suffixes like "(m)"/"(Set)"
--     appended that are NOT on the paper form (the paper form has those as a separate
--     UOM/mm column, not part of the description text) — restored to verbatim text.
--  2. `measurement`-type tables (Oil & Nitrogen pipe, Material Requirement, all
--     Retrofitting/Air Release/Cables tables) had col1_label/col2_label backwards: the
--     admin FormBuilder preview hardcodes "Description" as the row-text column header
--     and uses col1_label for the actual value-input column header (col2_label renders
--     as a redundant banner above the whole table) — col1_label is now the real unit
--     ("mm"/"UOM") and col2_label is cleared.
--  3. Sign-off section's "EMR ..." fields renamed to "Field Engineer ..." (standing
--     convention for this and future forms), and Customer Phone No. now prefills.
-- Safe to drop-and-reseed: form is still in draft status with zero submissions.
do $$
declare
  v_form_id  uuid;
  v_sec_id   uuid;
  v_table_id uuid;
begin

  delete from public.forms where name = 'NIFPS Installation - Assessment';

  insert into public.forms (name, job_type, status, field_count)
  values ('NIFPS Installation - Assessment', 'supervision', 'draft', 81)
  returning id into v_form_id;

  -- ── Section: Customer Details / ग्राहक विवरण ────────────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Customer Details', 'ग्राहक विवरण', 1)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name', 'ग्राहक का नाम', 'text', true,  true,  false, 1),
    (v_sec_id, 'Date',          'दिनांक',         'date', true,  false, false, 2),
    (v_sec_id, 'Phone No.',     'फोन नंबर',       'text', false, true,  false, 3),
    (v_sec_id, 'Site Address',  'साइट पता',       'text', true,  true,  false, 4);

  -- ── Section: Transformer Details / ट्रांसफॉर्मर विवरण ──────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Transformer Details', 'ट्रांसफॉर्मर विवरण', 2)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Rating',        'रेटिंग',         'text', false, true,  false, 1),
    (v_sec_id, 'Year of Mfg.',  'निर्माण वर्ष',   'text', false, false, false, 2),
    (v_sec_id, 'Serial Number', 'सीरियल नंबर',    'text', false, true,  false, 3);

  -- ── Section: EMR Engineer Details / EMR इंजीनियर विवरण ──────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'EMR Engineer Details', 'EMR इंजीनियर विवरण', 3)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Engineer Name', 'इंजीनियर का नाम', 'text', true,  true,  false, 1),
    (v_sec_id, 'Phone No.',     'फोन नंबर',         'text', false, false, false, 2);

  -- ── Section: Oil & Nitrogen Pipe Line Measurement – 1-Inch Pipe ─────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Oil & Nitrogen Pipe Line Measurement – 1-Inch Pipe', 'ऑयल एवं नाइट्रोजन पाइप लाइन माप – 1-इंच पाइप', 4)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'mm', 'mm')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Transformer quick drain valve to switch yard cubicle', 'ट्रांसफॉर्मर क्विक ड्रेन वाल्व से स्विच यार्ड क्यूबिकल तक', '(a)', 1),
    (v_table_id, 'Supporting of oil and nitrogen pipe', 'ऑयल एवं नाइट्रोजन पाइप का सपोर्टिंग', '(b)', 2);

  -- ── Section: Oil & Nitrogen Pipe Line Measurement – 3-Inch Pipe ─────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Oil & Nitrogen Pipe Line Measurement – 3-Inch Pipe', 'ऑयल एवं नाइट्रोजन पाइप लाइन माप – 3-इंच पाइप', 5)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'mm', 'mm')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Transformer oil drain valve to switch yard cubicle', 'ट्रांसफॉर्मर ऑयल ड्रेन वाल्व से स्विच यार्ड क्यूबिकल तक', '(a)', 1),
    (v_table_id, 'Cubicle panel to oil sump', 'क्यूबिकल पैनल से ऑयल सम्प तक', '(b)', 2);

  -- ── Section: Materials / सामग्री ────────────────────────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Materials', 'सामग्री', 6)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi, col2_label, col2_label_hi)
  values (v_sec_id, 'observation', false, 1, 'Description', 'विवरण', 'Remarks', 'टिप्पणियाँ')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Pipe Elbow, T-Joints, L-Angle plate, Flanges with gaskets and fasteners, Painting materials, etc.', 'पाइप एल्बो, टी-जॉइंट्स, एल-एंगल प्लेट, गैस्केट एवं फास्टनर्स सहित फ्लैंज, पेंटिंग सामग्री आदि', '1', 1);

  -- ── Section: Cable Requirement – 2-Core Cable (meters) ──────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Cable Requirement – 2-Core Cable (meters)', 'केबल आवश्यकता – 2-कोर केबल (मीटर)', 7)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi, col2_label, col2_label_hi)
  values (v_sec_id, 'observation', false, 1, 'Description', 'विवरण', 'Remarks', 'टिप्पणियाँ')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Individual Arc Sensor to Signal Box', 'प्रत्येक आर्क सेंसर से सिग्नल बॉक्स तक', '(A)', 1),
    (v_table_id, 'Shutter Valve to Signal Box Interconnection', 'शटर वाल्व से सिग्नल बॉक्स इंटरकनेक्शन', '(B)', 2);

  -- ── Section: Cable Requirement – 3-Core Cable (meters) ──────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Cable Requirement – 3-Core Cable (meters)', 'केबल आवश्यकता – 3-कोर केबल (मीटर)', 8)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi, col2_label, col2_label_hi)
  values (v_sec_id, 'observation', false, 1, 'Description', 'विवरण', 'Remarks', 'टिप्पणियाँ')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Power supply for NIFPS Control Panel', 'NIFPS कंट्रोल पैनल हेतु पावर सप्लाई', '1', 1);

  -- ── Section: Cable Requirement – 19-Core Cable (meters) ─────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Cable Requirement – 19-Core Cable (meters)', 'केबल आवश्यकता – 19-कोर केबल (मीटर)', 9)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi, col2_label, col2_label_hi)
  values (v_sec_id, 'observation', false, 1, 'Description', 'विवरण', 'Remarks', 'टिप्पणियाँ')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Switch Yard Cubicle to NIFPS Control Panel', 'स्विच यार्ड क्यूबिकल से NIFPS कंट्रोल पैनल तक', '(A)', 1),
    (v_table_id, 'NIFPS Control Panel Inter-connection to Transformer C&R Panel', 'NIFPS कंट्रोल पैनल से ट्रांसफॉर्मर C&R पैनल तक इंटरकनेक्शन', '(B)', 2);

  -- ── Section: Details to be Observed / निरीक्षण हेतु विवरण ──────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Details to be Observed', 'निरीक्षण हेतु विवरण', 10)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi, col2_label, col2_label_hi)
  values (v_sec_id, 'observation', false, 1, 'Item', 'विवरण', 'Details', 'विवरण')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id,
     'Status of switch yard cubicle panel plinth and oil sump construction – (In Progress / Completed). If plinth is not available, suggest location for cubicle plinth construction at 5m distance from transformer and mark oil sump at shortest distance from switch yard cubicle.',
     'स्विच यार्ड क्यूबिकल पैनल प्लिंथ एवं ऑयल सम्प निर्माण की स्थिति – (प्रगति में / पूर्ण)। यदि प्लिंथ उपलब्ध नहीं है, तो ट्रांसफॉर्मर से 5 मीटर दूरी पर क्यूबिकल प्लिंथ निर्माण हेतु स्थान सुझाएँ तथा स्विच यार्ड क्यूबिकल से न्यूनतम दूरी पर ऑयल सम्प का स्थान चिन्हित करें।',
     '1', 1),
    (v_table_id,
     'Check the Arc Sensor fixing provisions in transformer and measure inspection window dimensions Length × Breadth × Height (L × B × H).',
     'ट्रांसफॉर्मर में आर्क सेंसर फिक्सिंग व्यवस्था जाँचें तथा निरीक्षण विंडो का माप लंबाई × चौड़ाई × ऊँचाई (L × B × H) लें।',
     '2', 2),
    (v_table_id,
     'Strongly recommend customer for sand digging work for laying 3-inch pipe in ground from switch yard cubicle to oil sump and making hole (3 inch) in oil sump for inserting pipe – Provided / Not Provided',
     'ग्राहक को स्विच यार्ड क्यूबिकल से ऑयल सम्प तक 3-इंच पाइप भूमिगत बिछाने हेतु खुदाई कार्य तथा पाइप डालने के लिए ऑयल सम्प में 3-इंच छेद कराने की दृढ़ता से सलाह दें – उपलब्ध / उपलब्ध नहीं',
     '3', 3),
    (v_table_id,
     'Cable routing/trench from switch yard to control room (for cable laying to our control panel) – In Progress / Completed',
     'स्विच यार्ड से कंट्रोल रूम तक केबल रूटिंग / ट्रेंच (हमारे कंट्रोल पैनल हेतु केबल बिछाने के लिए) – प्रगति में / पूर्ण',
     '4', 4),
    (v_table_id,
     'Obtain the details from customer for mounting of NIFPS control panel',
     'NIFPS कंट्रोल पैनल माउंटिंग हेतु ग्राहक से विवरण प्राप्त करें।',
     '5', 5),
    (v_table_id,
     'Control room construction work status – In Progress / Complete',
     'कंट्रोल रूम निर्माण कार्य की स्थिति – प्रगति में / पूर्ण',
     '6', 6),
    (v_table_id,
     'Inform customer for arranging power source for pipeline fabrication work',
     'पाइपलाइन फैब्रिकेशन कार्य हेतु पावर सोर्स की व्यवस्था करने के लिए ग्राहक को सूचित करें।',
     '7', 7),
    (v_table_id,
     'Inform customer for arranging power source for pipeline fabrication work – Informed',
     'पाइपलाइन फैब्रिकेशन कार्य हेतु पावर सोर्स व्यवस्था के लिए ग्राहक को सूचित किया गया – सूचित',
     '8', 8);

  -- ── Section: Material Requirement / सामग्री आवश्यकता ────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Material Requirement', 'सामग्री आवश्यकता', 11)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, '80 NB Pipe (GI)', '80 NB पाइप (GI)', '1', 1),
    (v_table_id, '80 NB Flange (GI)', '80 NB फ्लैंज (GI)', '2', 2),
    (v_table_id, '80 NB Elbow (GI)', '80 NB एल्बो (GI)', '3', 3),
    (v_table_id, '80 NB T Joint (GI)', '80 NB टी जॉइंट (GI)', '4', 4),
    (v_table_id, '80 NB Gasket – 4 Holes', '80 NB गैस्केट – 4 होल', '5', 5),
    (v_table_id, '80 NB U-Bolt with Nut (Set)', '80 NB यू-बोल्ट नट सहित', '6', 6),
    (v_table_id, 'M16 × 80 Bolt, Nut with Washer (Set)', 'M16 × 80 बोल्ट, नट व वॉशर', '7', 7),
    (v_table_id, 'Support L Angle Plate 300 mm (MS)', 'सपोर्ट L एंगल प्लेट 300 mm (MS)', '8', 8),
    (v_table_id, 'Support L Angle Plate 200 mm (MS)', 'सपोर्ट L एंगल प्लेट 200 mm (MS)', '9', 9),
    (v_table_id, 'Anchor Bolt M10 Set', 'एंकर बोल्ट M10 सेट', '10', 10),
    (v_table_id, '25 NB Pipe (GI)', '25 NB पाइप (GI)', '11', 11),
    (v_table_id, '25 NB Flange (GI)', '25 NB फ्लैंज (GI)', '12', 12),
    (v_table_id, '25 NB Elbow (GI)', '25 NB एल्बो (GI)', '13', 13),
    (v_table_id, '25 NB T Joint (GI)', '25 NB टी जॉइंट (GI)', '14', 14),
    (v_table_id, '25 NB U-Bolt with Nut', '25 NB यू-बोल्ट नट सहित', '15', 15),
    (v_table_id, '25 NB Gasket – 4 Holes', '25 NB गैस्केट – 4 होल', '16', 16),
    (v_table_id, 'M12 × 60 Bolt, Nut with Washer (Set)', 'M12 × 60 बोल्ट, नट व वॉशर', '17', 17);

  -- ── Section: Retrofitting Materials – Arc Sensors Fixing Work ───────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Retrofitting Materials – Arc Sensors Fixing Work', 'रेट्रोफिटिंग सामग्री – आर्क सेंसर फिक्सिंग कार्य', 12)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Retro arc sensor flange (Straight) with stud & nuts', 'रेट्रो आर्क सेंसर फ्लैंज (सीधा) स्टड एवं नट सहित', '1', 1),
    (v_table_id, 'Retro arc sensor flange (Tilt) with stud & nuts', 'रेट्रो आर्क सेंसर फ्लैंज (टिल्ट) स्टड एवं नट सहित', '2', 2),
    (v_table_id, 'Arc sensors', 'आर्क सेंसर', '3', 3),
    (v_table_id, 'Arc sensors Gasket', 'आर्क सेंसर गैस्केट', '4', 4);

  -- ── Section: Oil Drain Line Retrofitting Materials ──────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Oil Drain Line Retrofitting Materials', 'ऑयल ड्रेन लाइन रेट्रोफिटिंग सामग्री', 13)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, '50 NB Gate Valve', '50 NB गेट वाल्व', '1', 1),
    (v_table_id, '50 NB Pipe', '50 NB पाइप', '2', 2),
    (v_table_id, 'M16 × 60 Fasteners Set', 'M16 × 60 फास्टनर्स सेट', '3', 3),
    (v_table_id, '50 NB Flange', '50 NB फ्लैंज', '4', 4),
    (v_table_id, '50 NB Gasket', '50 NB गैस्केट', '5', 5);

  -- ── Section: N2 Injection Line Retrofitting Materials ───────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'N2 Injection Line Retrofitting Materials', 'N2 इंजेक्शन लाइन रेट्रोफिटिंग सामग्री', 14)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, '50 NB Gate Valve', '50 NB गेट वाल्व', '1', 1),
    (v_table_id, '50 NB Flange', '50 NB फ्लैंज', '2', 2),
    (v_table_id, '50 NB Gasket', '50 NB गैस्केट', '3', 3),
    (v_table_id, '50 NB Pipe', '50 NB पाइप', '4', 4),
    (v_table_id, '80 NB Gate Valve', '80 NB गेट वाल्व', '5', 5),
    (v_table_id, '80 NB Flange', '80 NB फ्लैंज', '6', 6),
    (v_table_id, '80 NB Gasket', '80 NB गैस्केट', '7', 7),
    (v_table_id, '80 NB Pipe', '80 NB पाइप', '8', 8),
    (v_table_id, '25 NB Gate Valve', '25 NB गेट वाल्व', '9', 9),
    (v_table_id, '25 NB Flange', '25 NB फ्लैंज', '10', 10),
    (v_table_id, '25 NB Gasket', '25 NB गैस्केट', '11', 11),
    (v_table_id, '25 NB Pipe', '25 NB पाइप', '12', 12),
    (v_table_id, '80 NB to 50 NB Reducer', '80 NB से 50 NB रिड्यूसर', '13', 13),
    (v_table_id, '50 NB to 25 NB Reducer', '50 NB से 25 NB रिड्यूसर', '14', 14),
    (v_table_id, 'M16 × 60 Fasteners Set (Standard Pack)', 'M16 × 60 फास्टनर्स सेट (स्टैंडर्ड पैक)', '15', 15),
    (v_table_id, 'M12 × 60 Fasteners Set (Standard Pack)', 'M12 × 60 फास्टनर्स सेट (स्टैंडर्ड पैक)', '16', 16);

  -- ── Section: Air Release System / एयर रिलीज सिस्टम ──────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Air Release System', 'एयर रिलीज सिस्टम', 15)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Air releaser with reducer for 3" oil drain pipe line', '3" ऑयल ड्रेन पाइप लाइन हेतु एयर रिलीजर रिड्यूसर सहित', '1', 1),
    (v_table_id, 'Air releaser with reducer for N2 pipe line (1" pipe line)', 'N2 पाइप लाइन (1" पाइप लाइन) हेतु एयर रिलीजर रिड्यूसर सहित', '2', 2);

  -- ── Section: Cables / केबल्स ─────────────────────────────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Cables', 'केबल्स', 16)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index, col1_label, col1_label_hi)
  values (v_sec_id, 'measurement', false, 1, 'UOM', 'इकाई')
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, '19 Core Cable 1.5 Sq. mm', '19 कोर केबल 1.5 वर्ग मि.मी.', '1', 1),
    (v_table_id, 'LHD Cable', 'LHD केबल', '2', 2),
    (v_table_id, '3 Core Cable 1.5 Sq. mm', '3 कोर केबल 1.5 वर्ग मि.मी.', '3', 3),
    (v_table_id, '2 Core Cable 1.5 Sq. mm (FS)', '2 कोर केबल 1.5 वर्ग मि.मी. (FS)', '4', 4);

  -- ── Section: Sign-off / हस्ताक्षर ────────────────────────────────────────
  -- Standard signoff section (applies to this and future forms): Customer side +
  -- "Field Engineer" side (not "EMR") — Name / Signature / Phone No. each.
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Sign-off', 'हस्ताक्षर', 17)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer Name',              'ग्राहक का नाम',           'text',      true,  true,  false, 1),
    (v_sec_id, 'Customer Signature',         'ग्राहक हस्ताक्षर',         'signature', true,  false, false, 2),
    (v_sec_id, 'Customer Phone No.',         'ग्राहक फोन नंबर',         'text',      false, true,  false, 3),
    (v_sec_id, 'Field Engineer Name',        'फील्ड इंजीनियर का नाम',    'text',      true,  true,  false, 4),
    (v_sec_id, 'Field Engineer Signature',   'फील्ड इंजीनियर हस्ताक्षर',  'signature', true,  false, false, 5),
    (v_sec_id, 'Field Engineer Phone No.',   'फील्ड इंजीनियर फोन नंबर',  'text',      false, false, false, 6);

end $$;
