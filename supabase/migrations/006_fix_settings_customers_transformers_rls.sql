-- Fix RLS on settings, customers, and transformers.
-- These tables still used the old recursive profiles subquery pattern.

-- Settings
drop policy if exists "Super Admin can manage settings" on public.settings;
create policy "Super Admin can manage settings" on public.settings
  for all using (get_my_role() = 'Super Admin');

-- Customers
drop policy if exists "Admins and managers can manage customers" on public.customers;
create policy "Admins and managers can manage customers" on public.customers
  for all using (get_my_role() in ('Super Admin', 'Service Manager'));

-- Transformers
drop policy if exists "Admins can manage transformers" on public.transformers;
create policy "Admins can manage transformers" on public.transformers
  for all using (get_my_role() in ('Super Admin', 'Service Manager'));
