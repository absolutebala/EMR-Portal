-- Reports page permission. Service Manager sees it by default; Super Admin and Head of
-- Service always pass in code regardless of the stored JSON, but set here too for clarity.
-- Other roles can be granted it in Roles & Permissions.
update public.roles
set permissions = permissions || '{"Reports — View": true}'::jsonb
where name in ('Super Admin', 'Head of Service', 'Service Manager');
