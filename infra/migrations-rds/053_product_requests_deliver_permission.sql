-- Splits "mark delivered" into its own permission, distinct from "Product Requests
-- — Dispatch" — previously the Deliver action reused the Dispatch permission, so
-- there was no way to grant one without the other. Seeded to the same roles that
-- already have Dispatch (migration 039), so behavior doesn't change until someone
-- edits it in Roles & Permissions.
update public.roles
set permissions = permissions || '{"Product Requests — Deliver": true}'::jsonb
where name in ('Super Admin', 'Head of Service', 'Service Manager');
