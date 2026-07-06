-- Fix forms-related RLS policies.
-- The original policies queried `profiles` directly, which can fail for certain role setups.
-- Use get_my_role() (SECURITY DEFINER, bypasses RLS) for reliable role checks.

-- FORMS
drop policy if exists "Admins can manage forms" on public.forms;
create policy "Admins can manage forms" on public.forms
  for all using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );

-- FORM SECTIONS
drop policy if exists "Admins can manage form sections" on public.form_sections;
create policy "Admins can manage form sections" on public.form_sections
  for all using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );

-- FORM FIELDS
drop policy if exists "Admins can manage form fields" on public.form_fields;
create policy "Admins can manage form fields" on public.form_fields
  for all using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );

-- FORM TABLES
drop policy if exists "Admins can manage form tables" on public.form_tables;
create policy "Admins can manage form tables" on public.form_tables
  for all using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );

-- FORM TABLE ROWS
drop policy if exists "Admins can manage form table rows" on public.form_table_rows;
create policy "Admins can manage form table rows" on public.form_table_rows
  for all using (
    get_my_role() in ('Super Admin', 'Service Manager')
  );
