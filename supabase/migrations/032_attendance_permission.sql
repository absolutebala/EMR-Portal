-- New permission key so the Attendance nav item + page are hidden unless
-- explicitly granted (see Sidebar.tsx's allowed() fallback: any role with a
-- non-empty permissions object hides a nav item whose key isn't set true).
update public.roles
set permissions = permissions || '{"Attendance — View": true}'::jsonb
where name in ('Super Admin', 'Service Manager');
