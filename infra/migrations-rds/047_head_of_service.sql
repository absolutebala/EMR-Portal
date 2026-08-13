-- New role sitting above Service Manager: same permissions as Super Admin (copied
-- live from the Super Admin row rather than hand-listed, so it can't drift out of
-- sync with whatever permission keys exist by the time this runs), plus Service
-- Manager now requires a reporting manager (Head of Service).
insert into public.roles (name, is_system, requires_manager, permissions)
select 'Head of Service', true, false, permissions
from public.roles where name = 'Super Admin'
on conflict (name) do nothing;

update public.roles set requires_manager = true where name = 'Service Manager';
