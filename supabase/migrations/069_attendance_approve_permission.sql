-- New permission key gating who can approve/reject a field engineer's late attendance
-- amendment request — same pattern as 032_attendance_permission.sql. Head of Service
-- gets access via the app-layer can() helper's hardcoded bypass, not via this table.
update public.roles
set permissions = permissions || '{"Attendance — Approve": true}'::jsonb
where name in ('Super Admin', 'Service Manager');
