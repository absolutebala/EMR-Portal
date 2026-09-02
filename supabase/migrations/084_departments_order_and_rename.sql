-- Departments: add an explicit display order and replace the list with the client's
-- canonical set. Everything (work_orders.department_id, profiles.department_id,
-- profile_departments) links by department id, so renaming in place keeps every
-- existing notification and profile assignment intact — no re-tagging needed.

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Rename existing rows to the new names (join-by-id preserves all assignments).
UPDATE public.departments SET name = 'Breather'     WHERE name = 'L&Breather';
UPDATE public.departments SET name = 'NIFPS'        WHERE name = 'NIFPS 1';
UPDATE public.departments SET name = 'NIFPS (Inst)' WHERE name = 'NIFPS 2';
UPDATE public.departments SET name = 'SPL'          WHERE name = 'New Product';
-- 'Global' and 'OLTC' keep their names.

-- Ensure the full target set exists (adds the brand-new 'L Type', plus any that were
-- missing before the rename). name is UNIQUE so duplicates are skipped.
INSERT INTO public.departments (name) VALUES
  ('Breather'), ('Global'), ('L Type'), ('NIFPS'), ('NIFPS (Inst)'), ('OLTC'), ('SPL')
ON CONFLICT (name) DO NOTHING;

-- Fixed display order requested by the client.
UPDATE public.departments SET sort_order = CASE name
  WHEN 'Breather'     THEN 1
  WHEN 'Global'       THEN 2
  WHEN 'L Type'       THEN 3
  WHEN 'NIFPS'        THEN 4
  WHEN 'NIFPS (Inst)' THEN 5
  WHEN 'OLTC'         THEN 6
  WHEN 'SPL'          THEN 7
  ELSE sort_order
END;
