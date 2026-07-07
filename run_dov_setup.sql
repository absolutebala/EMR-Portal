-- NIFPS Division of Works form seed
-- Run in the correct Supabase project SQL editor

do $$
declare
  v_form_id uuid;
  v_sec_id  uuid;
begin
  if exists (select 1 from public.forms where name = 'NIFPS Division of Works') then
    return;
  end if;

  insert into public.forms (name, job_type, status, field_count)
  values ('NIFPS Division of Works', 'commissioning_activities', 'active', 128)
  returning id into v_form_id;

  -- ── Section 1: Project Details ─────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Project Details', 1) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Customer Name',      'text', true,  true,  false, 1),
    (v_sec_id, 'Site Address',       'text', true,  true,  false, 2),
    (v_sec_id, 'Date',               'date', true,  true,  false, 3),
    (v_sec_id, 'Serial Number',      'text', false, true,  false, 4),
    (v_sec_id, 'EMR Engineer Name',  'text', false, true,  false, 5);

  -- ── Section 2: Scope of Work ───────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Scope of Work', 2) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '(1) Supply of Fire Extinguishing Device (FE), Control Panel, Signal Box, HD Cable, Shutter Valve Assy (TCV), ARC sensor, 2 core FS cable — EMR Scope', 'checkbox', false, false, false, 1),
    (v_sec_id, '(1) Above items — Under Customer Scope', 'checkbox', false, false, false, 2),
    (v_sec_id, '(2) All pipelines and pipe fittings complete with connections, flanges, bends etc. from transformer to FE and from FE to oil pit chamber — EMR Scope', 'checkbox', false, false, false, 3),
    (v_sec_id, '(2) Above items — Under Customer Scope', 'checkbox', false, false, false, 4),
    (v_sec_id, '(3) FRLS 19 core & 12 core x 1.5 sq.mm armoured cable — EMR Scope', 'checkbox', false, false, false, 5),
    (v_sec_id, '(3) Above items — Under Customer Scope', 'checkbox', false, false, false, 6),
    (v_sec_id, '(4) Installation, supervision, testing & commissioning of NIFPS system — EMR Scope', 'checkbox', false, false, false, 7),
    (v_sec_id, '(4) Above items — Under Customer Scope', 'checkbox', false, false, false, 8),
    (v_sec_id, '(5) Civil work for NIFPS plinth, oil pit & firewall, pipe supports, cable tray — EMR Scope', 'checkbox', false, false, false, 9),
    (v_sec_id, '(5) Above items — Under Customer Scope', 'checkbox', false, false, false, 10),
    (v_sec_id, '(6) Transformer oil drainage, refilling or make-up (oil filtration) — EMR Scope', 'checkbox', false, false, false, 11),
    (v_sec_id, '(6) Above items — Under Customer Scope', 'checkbox', false, false, false, 12),
    (v_sec_id, '(7) Packing and forwarding — EMR Scope', 'checkbox', false, false, false, 13),
    (v_sec_id, '(7) Above items — Under Customer Scope', 'checkbox', false, false, false, 14),
    (v_sec_id, '(8) Power supply required for installation at site — EMR Scope', 'checkbox', false, false, false, 15),
    (v_sec_id, '(8) Above items — Under Customer Scope', 'checkbox', false, false, false, 16),
    (v_sec_id, '(9) Internal transportation / movement of equipment during erection (crane, hydra, etc.) — EMR Scope', 'checkbox', false, false, false, 17),
    (v_sec_id, '(9) Above items — Under Customer Scope', 'checkbox', false, false, false, 18),
    (v_sec_id, '(10) Separate earthing for NIFPS system — EMR Scope', 'checkbox', false, false, false, 19),
    (v_sec_id, '(10) Above items — Under Customer Scope', 'checkbox', false, false, false, 20),
    (v_sec_id, '(11) NIFPS control panel SCADA & hiring relay panel — EMR Scope', 'checkbox', false, false, false, 21),
    (v_sec_id, '(11) Above items — Under Customer Scope', 'checkbox', false, false, false, 22);

  -- ── Section 3: Division of Works - Design & Engineering ───────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Division of Works - Design & Engineering', 3) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '(1) Design, engineering drawings & calculations of NIFPS for transformer — TTDI',        'checkbox',  false, false, false, 1),
    (v_sec_id, '(1) Design, engineering drawings & calculations of NIFPS for transformer — NIFPS Vendor','checkbox',  false, false, false, 2),
    (v_sec_id, '(1) Remarks',                                                                            'text',      false, false, false, 3),
    (v_sec_id, '(2) Input details of transformer for NIFPS designing — TTDI',                           'checkbox',  false, false, false, 4),
    (v_sec_id, '(2) Input details of transformer for NIFPS designing — NIFPS Vendor',                   'checkbox',  false, false, false, 5),
    (v_sec_id, '(2) Remarks',                                                                            'text',      false, false, false, 6),
    (v_sec_id, '(3) Calculation for nitrogen gas & oil drain adequacy — TTDI',                          'checkbox',  false, false, false, 7),
    (v_sec_id, '(3) Calculation for nitrogen gas & oil drain adequacy — NIFPS Vendor',                  'checkbox',  false, false, false, 8),
    (v_sec_id, '(3) Remarks',                                                                            'text',      false, false, false, 9),
    (v_sec_id, '(4) Input for sensor / fire detector locations — TTDI',                                 'checkbox',  false, false, false, 10),
    (v_sec_id, '(4) Input for sensor / fire detector locations — NIFPS Vendor',                         'checkbox',  false, false, false, 11),
    (v_sec_id, '(4) Remarks',                                                                            'text',      false, false, false, 12),
    (v_sec_id, '(5) Pipe size inputs for oil drain & nitrogen injection — TTDI',                        'checkbox',  false, false, false, 13),
    (v_sec_id, '(5) Pipe size inputs for oil drain & nitrogen injection — NIFPS Vendor',                'checkbox',  false, false, false, 14),
    (v_sec_id, '(5) Remarks',                                                                            'text',      false, false, false, 15),
    (v_sec_id, '(6) Provision for sensor fixing & pipe connections — TTDI',                             'checkbox',  false, false, false, 16),
    (v_sec_id, '(6) Provision for sensor fixing & pipe connections — NIFPS Vendor',                     'checkbox',  false, false, false, 17),
    (v_sec_id, '(6) Remarks',                                                                            'text',      false, false, false, 18),
    (v_sec_id, '(7) Ground mounting arrangement & civil work inputs — TTDI',                            'checkbox',  false, false, false, 19),
    (v_sec_id, '(7) Ground mounting arrangement & civil work inputs — NIFPS Vendor',                    'checkbox',  false, false, false, 20),
    (v_sec_id, '(7) Remarks',                                                                            'text',      false, false, false, 21),
    (v_sec_id, '(8) Cable quantity & termination inputs — TTDI',                                        'checkbox',  false, false, false, 22),
    (v_sec_id, '(8) Cable quantity & termination inputs — NIFPS Vendor',                                'checkbox',  false, false, false, 23),
    (v_sec_id, '(8) Remarks',                                                                            'text',      false, false, false, 24),
    (v_sec_id, '(9) Provision for SCADA integration — TTDI',                                            'checkbox',  false, false, false, 25),
    (v_sec_id, '(9) Provision for SCADA integration — NIFPS Vendor',                                    'checkbox',  false, false, false, 26),
    (v_sec_id, '(9) Remarks',                                                                            'text',      false, false, false, 27),
    (v_sec_id, '(10) Communication facility with SCADA (IEC 61850 / MODBUS) — TTDI',                   'checkbox',  false, false, false, 28),
    (v_sec_id, '(10) Communication facility with SCADA (IEC 61850 / MODBUS) — NIFPS Vendor',           'checkbox',  false, false, false, 29),
    (v_sec_id, '(10) Remarks',                                                                           'text',      false, false, false, 30),
    (v_sec_id, '(11) Inputs for FO cables, power & control cables — TTDI',                              'checkbox',  false, false, false, 31),
    (v_sec_id, '(11) Inputs for FO cables, power & control cables — NIFPS Vendor',                     'checkbox',  false, false, false, 32),
    (v_sec_id, '(11) Remarks',                                                                           'text',      false, false, false, 33),
    (v_sec_id, '(12) NIFPS panel & nitrogen cylinder arrangement for civil design — TTDI',              'checkbox',  false, false, false, 34),
    (v_sec_id, '(12) NIFPS panel & nitrogen cylinder arrangement for civil design — NIFPS Vendor',      'checkbox',  false, false, false, 35),
    (v_sec_id, '(12) Remarks',                                                                           'text',      false, false, false, 36),
    (v_sec_id, '(13) Civil work input details — TTDI',                                                  'checkbox',  false, false, false, 37),
    (v_sec_id, '(13) Civil work input details — NIFPS Vendor',                                          'checkbox',  false, false, false, 38),
    (v_sec_id, '(13) Remarks',                                                                           'text',      false, false, false, 39),
    (v_sec_id, '(14) Technical support for approval of documents — TTDI',                               'checkbox',  false, false, false, 40),
    (v_sec_id, '(14) Technical support for approval of documents — NIFPS Vendor',                       'checkbox',  false, false, false, 41),
    (v_sec_id, '(14) Remarks',                                                                           'text',      false, false, false, 42),
    (v_sec_id, '(15) Manual (Installation & O&M) - hard & soft copy — TTDI',                           'checkbox',  false, false, false, 43),
    (v_sec_id, '(15) Manual (Installation & O&M) - hard & soft copy — NIFPS Vendor',                   'checkbox',  false, false, false, 44),
    (v_sec_id, '(15) Remarks',                                                                           'text',      false, false, false, 45);

  -- ── Section 4: Division of Works - Manufacturing, Testing & Supply ─────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Division of Works - Manufacturing, Testing & Supply', 4) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '(1) Material to be manufactured as per approved QAP/MQP — TTDI',        'checkbox',  false, false, false, 1),
    (v_sec_id, '(1) Material to be manufactured as per approved QAP/MQP — NIFPS Vendor','checkbox',  false, false, false, 2),
    (v_sec_id, '(1) Remarks',                                                             'text',      false, false, false, 3),
    (v_sec_id, '(2) Factory acceptance test before dispatch — TTDI',                     'checkbox',  false, false, false, 4),
    (v_sec_id, '(2) Factory acceptance test before dispatch — NIFPS Vendor',             'checkbox',  false, false, false, 5),
    (v_sec_id, '(2) Remarks',                                                             'text',      false, false, false, 6),
    (v_sec_id, '(3) Preparation & submission of test reports & certificates — TTDI',     'checkbox',  false, false, false, 7),
    (v_sec_id, '(3) Preparation & submission of test reports & certificates — NIFPS Vendor','checkbox',false, false, false, 8),
    (v_sec_id, '(3) Remarks',                                                             'text',      false, false, false, 9),
    (v_sec_id, '(4) Supply of material with accessories, tools & tackles — TTDI',        'checkbox',  false, false, false, 10),
    (v_sec_id, '(4) Supply of material with accessories, tools & tackles — NIFPS Vendor','checkbox',  false, false, false, 11),
    (v_sec_id, '(4) Remarks',                                                             'text',      false, false, false, 12),
    (v_sec_id, '(5) Material unloading at site — TTDI',                                 'checkbox',  false, false, false, 13),
    (v_sec_id, '(5) Material unloading at site — NIFPS Vendor',                         'checkbox',  false, false, false, 14),
    (v_sec_id, '(5) Remarks',                                                             'text',      false, false, false, 15),
    (v_sec_id, '(6) Material storage at site — TTDI',                                   'checkbox',  false, false, false, 16),
    (v_sec_id, '(6) Material storage at site — NIFPS Vendor',                           'checkbox',  false, false, false, 17),
    (v_sec_id, '(6) Remarks',                                                             'text',      false, false, false, 18),
    (v_sec_id, '(7) Supply of commissioning spares & consumables — TTDI',               'checkbox',  false, false, false, 19),
    (v_sec_id, '(7) Supply of commissioning spares & consumables — NIFPS Vendor',       'checkbox',  false, false, false, 20),
    (v_sec_id, '(7) Remarks',                                                             'text',      false, false, false, 21);

  -- ── Section 5: Division of Works - Site Installation, Testing & Commissioning
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Division of Works - Site Installation, Testing & Commissioning', 5) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, '(1) Installation of NIFPS system as per approved drawings — TTDI',              'checkbox',  false, false, false, 1),
    (v_sec_id, '(1) Installation of NIFPS system as per approved drawings — NIFPS Vendor',      'checkbox',  false, false, false, 2),
    (v_sec_id, '(1) Remarks',                                                                    'text',      false, false, false, 3),
    (v_sec_id, '(2) Laying & termination of power & control cables — TTDI',                     'checkbox',  false, false, false, 4),
    (v_sec_id, '(2) Laying & termination of power & control cables — NIFPS Vendor',             'checkbox',  false, false, false, 5),
    (v_sec_id, '(2) Remarks',                                                                    'text',      false, false, false, 6),
    (v_sec_id, '(3) Installation, testing, commissioning & demo to customer — TTDI',            'checkbox',  false, false, false, 7),
    (v_sec_id, '(3) Installation, testing, commissioning & demo to customer — NIFPS Vendor',    'checkbox',  false, false, false, 8),
    (v_sec_id, '(3) Remarks',                                                                    'text',      false, false, false, 9),
    (v_sec_id, '(4) Integration with SAS system — TTDI',                                        'checkbox',  false, false, false, 10),
    (v_sec_id, '(4) Integration with SAS system — NIFPS Vendor',                                'checkbox',  false, false, false, 11),
    (v_sec_id, '(4) Remarks',                                                                    'text',      false, false, false, 12),
    (v_sec_id, '(5) Service support during warranty period — TTDI',                             'checkbox',  false, false, false, 13),
    (v_sec_id, '(5) Service support during warranty period — NIFPS Vendor',                     'checkbox',  false, false, false, 14),
    (v_sec_id, '(5) Remarks',                                                                    'text',      false, false, false, 15),
    (v_sec_id, '(6) Training to client (if required) — TTDI',                                   'checkbox',  false, false, false, 16),
    (v_sec_id, '(6) Training to client (if required) — NIFPS Vendor',                           'checkbox',  false, false, false, 17),
    (v_sec_id, '(6) Remarks',                                                                    'text',      false, false, false, 18),
    (v_sec_id, '(7) Supply of nitrogen gas cylinders with valves & accessories — TTDI',         'checkbox',  false, false, false, 19),
    (v_sec_id, '(7) Supply of nitrogen gas cylinders with valves & accessories — NIFPS Vendor', 'checkbox',  false, false, false, 20),
    (v_sec_id, '(7) Remarks',                                                                    'text',      false, false, false, 21),
    (v_sec_id, '(8) Tools & spares for operation & maintenance — TTDI',                         'checkbox',  false, false, false, 22),
    (v_sec_id, '(8) Tools & spares for operation & maintenance — NIFPS Vendor',                 'checkbox',  false, false, false, 23),
    (v_sec_id, '(8) Remarks',                                                                    'text',      false, false, false, 24),
    (v_sec_id, '(9) Maintenance tools for cylinders, valves & pipe connections — TTDI',         'checkbox',  false, false, false, 25),
    (v_sec_id, '(9) Maintenance tools for cylinders, valves & pipe connections — NIFPS Vendor', 'checkbox',  false, false, false, 26),
    (v_sec_id, '(9) Remarks',                                                                    'text',      false, false, false, 27),
    (v_sec_id, '(10) Civil work execution — TTDI',                                              'checkbox',  false, false, false, 28),
    (v_sec_id, '(10) Civil work execution — NIFPS Vendor',                                      'checkbox',  false, false, false, 29),
    (v_sec_id, '(10) Remarks',                                                                   'text',      false, false, false, 30),
    (v_sec_id, '(11) Transportation, accommodation & logistics — TTDI',                         'checkbox',  false, false, false, 31),
    (v_sec_id, '(11) Transportation, accommodation & logistics — NIFPS Vendor',                 'checkbox',  false, false, false, 32),
    (v_sec_id, '(11) Remarks',                                                                   'text',      false, false, false, 33),
    (v_sec_id, '(12) Safety equipment, PPE & compliance — TTDI',                                'checkbox',  false, false, false, 34),
    (v_sec_id, '(12) Safety equipment, PPE & compliance — NIFPS Vendor',                        'checkbox',  false, false, false, 35),
    (v_sec_id, '(12) Remarks',                                                                   'text',      false, false, false, 36),
    (v_sec_id, '(13) Safety training as per client/TTDI protocol — TTDI',                       'checkbox',  false, false, false, 37),
    (v_sec_id, '(13) Safety training as per client/TTDI protocol — NIFPS Vendor',               'checkbox',  false, false, false, 38),
    (v_sec_id, '(13) Remarks',                                                                   'text',      false, false, false, 39),
    (v_sec_id, '(14) Submission of final as-built drawings & manuals — TTDI',                   'checkbox',  false, false, false, 40),
    (v_sec_id, '(14) Submission of final as-built drawings & manuals — NIFPS Vendor',           'checkbox',  false, false, false, 41),
    (v_sec_id, '(14) Remarks',                                                                   'text',      false, false, false, 42);

  -- ── Section 6: Signatures ──────────────────────────────────────────────────
  insert into public.form_sections (form_id, title, order_index)
  values (v_form_id, 'Signatures', 6) returning id into v_sec_id;
  insert into public.form_fields (section_id, label, field_type, is_required, prefill_from_job, read_only_on_mobile, order_index) values
    (v_sec_id, 'Customer Name',      'text',      false, false, false, 1),
    (v_sec_id, 'Customer Signature', 'signature', false, false, false, 2),
    (v_sec_id, 'EMR Name',           'text',      false, false, false, 3),
    (v_sec_id, 'EMR Signature',      'signature', false, false, false, 4);

end $$;
