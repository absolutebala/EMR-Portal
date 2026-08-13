-- The "Work Orders" module label was renamed to "Notifications" everywhere in the UI
-- (cosmetic only — the work_orders table, wo_number, and code internals are unchanged).
-- Permission keys double as both the stored JSONB key and the displayed checkbox label
-- in the Roles UI, so the stored keys need renaming too or existing grants would stop
-- matching Sidebar.tsx's permKey lookups.
update public.roles
set permissions = (permissions - 'Work Orders — View')
  || jsonb_build_object('Notifications — View', permissions->'Work Orders — View')
where permissions ? 'Work Orders — View';

update public.roles
set permissions = (permissions - 'Work Orders — Create / Edit')
  || jsonb_build_object('Notifications — Create / Edit', permissions->'Work Orders — Create / Edit')
where permissions ? 'Work Orders — Create / Edit';

update public.roles
set permissions = (permissions - 'Work Orders — Delete')
  || jsonb_build_object('Notifications — Delete', permissions->'Work Orders — Delete')
where permissions ? 'Work Orders — Delete';
