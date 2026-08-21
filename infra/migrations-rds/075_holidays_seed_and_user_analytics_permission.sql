-- Starter set of India's fixed-date national holidays (2026 + 2027) so the admin
-- only has to add/remove exceptions instead of building the whole calendar from
-- scratch. Diwali/Holi/etc. are lunar-calendar and stay manually added via the
-- existing Settings -> Holidays "+ Add holiday" flow. holiday_date is unique, so
-- this insert is idempotent.
insert into public.holidays (holiday_date, name) values
  ('2026-01-26', 'Republic Day'), ('2026-08-15', 'Independence Day'), ('2026-10-02', 'Gandhi Jayanti'),
  ('2027-01-26', 'Republic Day'), ('2027-08-15', 'Independence Day'), ('2027-10-02', 'Gandhi Jayanti')
on conflict (holiday_date) do nothing;

-- New permission key gating the User Analytics page (avatar dropdown, top right).
-- Same pattern as 069_attendance_approve_permission.sql — Head of Service gets
-- access via the app-layer hardcoded bypass, not via this table.
update public.roles
set permissions = permissions || '{"User Analytics — View": true}'::jsonb
where name in ('Super Admin', 'Service Manager');
