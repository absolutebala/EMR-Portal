-- Seeds "NIFPS Installation MOM Report" — a bilingual (English/Hindi) form combining
-- two documents from the same physical packet into one form (per user confirmation):
--   1. "NIFPS Installation MOM Report" — customer/transformer info + a 17-item
--      Details of Checks/Tests table (✓/✗ maps to the existing yes_no status_type's
--      Yes/No buttons).
--   2. "Pre-Commissioning Checklist" (Customer Scope) — a Tested/Not Tested table with
--      parent rows 1 and 2 broken into lettered sub-items (a)(b)(c)/(a)-(e), using
--      form_table_rows.parent_row_id + has_subrows, same mechanism already used by
--      yes_no/tested_not_tested tables elsewhere.
-- Sign-off section follows the "Field Engineer" (not "EMR") naming convention
-- established in migration 060 for this and future forms. The two instructional
-- paragraphs on the Pre-Commissioning Checklist page ("Commissioning engineer shall
-- reach the site...", "Pre-commissioning customer checklist must be completed...") are
-- not represented as form content — there's no static-text field_type, and the section
-- title carries the meaning, consistent with how 060 handled similar framing text.
do $$
declare
  v_form_id  uuid;
  v_sec_id   uuid;
  v_table_id uuid;
  v_row_id   uuid;
begin

  delete from public.forms where name = 'NIFPS Installation MOM Report';

  insert into public.forms (name, job_type, status, field_count)
  values ('NIFPS Installation MOM Report', 'installation', 'draft', 47)
  returning id into v_form_id;

  -- ── Section: Customer Information / ग्राहक जानकारी ──────────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Customer Information', 'ग्राहक जानकारी', 1)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Customer',              'ग्राहक',                'text', true,  true,  false, 1),
    (v_sec_id, 'End User',               'एंड यूज़र',              'text', false, false, false, 2),
    (v_sec_id, 'Installation Location',  'इंस्टॉलेशन लोकेशन',      'text', true,  true,  false, 3),
    (v_sec_id, 'Project Details (if any)', 'प्रोजेक्ट डिटेल्स (यदि कोई हो)', 'text', false, false, false, 4);

  -- ── Section: Transformer Details / ट्रांसफॉर्मर डिटेल्स ─────────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Transformer Details', 'ट्रांसफॉर्मर डिटेल्स', 2)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Manufacturer',                   'मैन्युफैक्चरर',              'text', false, true,  false, 1),
    (v_sec_id, 'Rating of Transformer',          'ट्रांसफॉर्मर रेटिंग',        'text', false, true,  false, 2),
    (v_sec_id, 'Site Address (Including State)', 'साइट एड्रेस (राज्य सहित)',   'text', true,  true,  false, 3),
    (v_sec_id, 'Contact no',                      'संपर्क नंबर',               'text', false, true,  false, 4),
    (v_sec_id, 'Date of Installation',            'इंस्टॉलेशन की तिथि',         'date', true,  false, false, 5),
    (v_sec_id, 'Duration',                        'अवधि',                     'text', false, false, false, 6),
    -- NOT prefilled: this is the NIFPS unit's own serial number, a different value
    -- from the transformer serial number that getPrefillValue() would otherwise match
    -- on the word "serial" — leaving prefill_from_job false keeps this field blank for
    -- the engineer to enter manually instead of silently filling in the wrong serial.
    (v_sec_id, 'NIFPS Serial No.',                'NIFPS सीरियल नंबर',         'text', false, false, false, 7);

  -- ── Section: Details of Checks / Tests / जांच/परीक्षण विवरण ─────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Details of Checks / Tests', 'जांच / परीक्षण विवरण', 3)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'yes_no', false, 1)
  returning id into v_table_id;

  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'Verification of switchyard cubicle panel erection was carried out.', 'स्विचयार्ड क्यूबिकल पैनल स्थापना का सत्यापन किया गया।', '1', 1),
    (v_table_id, 'Verification of signal box erection was carried out.', 'सिग्नल बॉक्स स्थापना का सत्यापन किया गया।', '2', 2),
    (v_table_id, 'Verification of control panel erection was carried out.', 'कंट्रोल पैनल स्थापना का सत्यापन किया गया।', '3', 3),
    (v_table_id, 'Inspection of shutter valve erection along with cabling and termination was carried out.', 'शटर वाल्व स्थापना का निरीक्षण केबलिंग एवं टर्मिनेशन सहित किया गया।', '4', 4),
    (v_table_id, 'Inspection of arc sensor fixing, cabling, and termination was carried out.', 'आर्क सेंसर फिक्सिंग, केबलिंग एवं टर्मिनेशन का निरीक्षण किया गया।', '5', 5),
    (v_table_id, 'Support pipe grouting work (under customer civil scope) was reviewed.', 'सपोर्ट पाइप ग्राउटिंग कार्य (ग्राहक सिविल स्कोप के अंतर्गत) की समीक्षा की गई।', '6', 6),
    (v_table_id, 'LHD cable laying with conduit was checked.', 'कंड्यूट सहित LHD केबल बिछाने की जांच की गई।', '7', 7),
    (v_table_id, 'Drain line piping fabrication and painting were inspected.', 'ड्रेन लाइन पाइपिंग फैब्रिकेशन एवं पेंटिंग का निरीक्षण किया गया।', '8', 8),
    (v_table_id, 'N2 line piping fabrication and painting were inspected.', 'N2 लाइन पाइपिंग फैब्रिकेशन एवं पेंटिंग का निरीक्षण किया गया।', '9', 9),
    (v_table_id, 'Pressure test at (3-4) bar for 30 minutes was conducted and checked using soap solution for leak detection.', '(3-4) बार प्रेशर पर 30 मिनट तक प्रेशर टेस्ट किया गया तथा लीकेज जांच हेतु साबुन घोल से परीक्षण किया गया।', '10', 10),
    (v_table_id, 'Installation of control panel and cubicle panel lock sets was checked.', 'कंट्रोल पैनल एवं क्यूबिकल पैनल लॉक सेट की स्थापना की जांच की गई।', '11', 11),
    (v_table_id, '19-core cable laying and termination between switchyard cubicle to control panel were checked.', 'स्विचयार्ड क्यूबिकल से कंट्रोल पैनल तक 19-कोर केबल बिछाने एवं टर्मिनेशन की जांच की गई।', '12', 12),
    (v_table_id, '19-core cable laying and termination between signal box to control panel were checked.', 'सिग्नल बॉक्स से कंट्रोल पैनल तक 19-कोर केबल बिछाने एवं टर्मिनेशन की जांच की गई।', '13', 13),
    (v_table_id, '19-core cable laying and termination between NIFPS control panel to transformer relay panel were checked.', 'NIFPS कंट्रोल पैनल से ट्रांसफॉर्मर रिले पैनल तक 19-कोर केबल बिछाने एवं टर्मिनेशन की जांच की गई।', '14', 14),
    (v_table_id, 'Cable tagging for 19-core cables (end-to-end) was verified.', '19-कोर केबल्स की एंड-टू-एंड टैगिंग सत्यापित की गई।', '15', 15),
    (v_table_id, 'Ferruling of 19-core cables was verified.', '19-कोर केबल्स की फेरूलिंग सत्यापित की गई।', '16', 16),
    (v_table_id, '19 core cables should be connected at both ends with serial numbers.', '19 कोर केबल्स दोनों सिरों पर सीरियल नंबर सहित कनेक्ट की जानी चाहिए।', '17', 17);

  -- ── Section: Pre-Commissioning Checklist (Customer Scope) ───────────────
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Pre-Commissioning Checklist (Customer Scope)', 'प्री-कमीशनिंग चेकलिस्ट (ग्राहक स्कोप)', 4)
  returning id into v_sec_id;

  insert into public.form_tables (section_id, status_type, has_subrows, order_index)
  values (v_sec_id, 'tested_not_tested', true, 1)
  returning id into v_table_id;

  -- Row 1 + sub-items (a)(b)(c)
  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values (v_table_id, 'Earthing of the below switchyard equipment is to be verified.', 'नीचे दिए गए स्विचयार्ड उपकरणों की अर्थिंग सत्यापित की जानी है।', '1', 1)
  returning id into v_row_id;

  insert into public.form_table_rows (table_id, parent_row_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, v_row_id, 'Cubicle panel', 'क्यूबिकल पैनल', '(a)', 1),
    (v_table_id, v_row_id, 'control panel', 'कंट्रोल पैनल', '(b)', 2),
    (v_table_id, v_row_id, 'signal box', 'सिग्नल बॉक्स', '(c)', 3);

  -- Row 2 + sub-items (a)-(e)
  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values (v_table_id, 'Potential-free contact assigned with the main protection relay was configured.', 'मुख्य प्रोटेक्शन रिले के साथ निर्धारित पोटेंशियल-फ्री कॉन्टैक्ट कॉन्फ़िगर किया गया।', '2', 2)
  returning id into v_row_id;

  insert into public.form_table_rows (table_id, parent_row_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, v_row_id, 'Differential Protection Input (NO)', 'डिफरेंशियल प्रोटेक्शन इनपुट (NO)', '(a)', 1),
    (v_table_id, v_row_id, 'PRV Trip – (1) & (2) (NO)', 'PRV ट्रिप – (1) एवं (2) (NO)', '(b)', 2),
    (v_table_id, v_row_id, 'Buchholz Trip (NO)', 'बुचहोल्ज़ ट्रिप (NO)', '(c)', 3),
    (v_table_id, v_row_id, 'Master Trip Feedback (86 Relay) (NO)', 'मास्टर ट्रिप फीडबैक (86 रिले) (NO)', '(d)', 4),
    (v_table_id, v_row_id, 'Master Relay Trip Command – 110V / 220V', 'मास्टर रिले ट्रिप कमांड – 110V / 220V', '(e)', 5);

  -- Rows 3-4, standalone (no sub-items)
  insert into public.form_table_rows (table_id, row_label, row_label_hi, sno_label, order_index)
  values
    (v_table_id, 'AC supply availability was verified in control panel.', 'कंट्रोल पैनल में AC सप्लाई की उपलब्धता सत्यापित की गई।', '3', 3),
    (v_table_id, 'DC cable availability was verified in control panel.', 'कंट्रोल पैनल में DC केबल की उपलब्धता सत्यापित की गई।', '4', 4);

  -- ── Section: Material Requirement (if any) / सामग्री आवश्यकता (यदि कोई हो) ─
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Material Requirement (if any)', 'सामग्री आवश्यकता (यदि कोई हो)', 5)
  returning id into v_sec_id;

  insert into public.form_fields
    (section_id, label, label_hi, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index)
  values
    (v_sec_id, 'Material Requirement', 'सामग्री आवश्यकता', 'long_text', false, false, false, 1);

  -- ── Section: Sign-off / हस्ताक्षर ────────────────────────────────────────
  -- "Field Engineer" naming (not "EMR (Installation Team)" as printed on the paper
  -- form) — standing convention from migration 060, applied to this and future forms.
  insert into public.form_sections (form_id, title, title_hi, order_index)
  values (v_form_id, 'Sign-off', 'हस्ताक्षर', 6)
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
