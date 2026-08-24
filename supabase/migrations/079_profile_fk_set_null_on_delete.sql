-- work_orders.created_by and form_submissions.submitted_by are audit-trail
-- attribution fields ("who created this notification" / "who submitted this
-- form"), not data that should block deleting a profile — but neither had an
-- ON DELETE clause, so Postgres defaulted to NO ACTION and deleting a user who
-- had ever created a notification or submitted a form failed with a foreign key
-- violation. Matches the ON DELETE SET NULL already used on work_orders.engineer_id.
alter table public.work_orders drop constraint work_orders_created_by_fkey;
alter table public.work_orders add constraint work_orders_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.form_submissions drop constraint form_submissions_submitted_by_fkey;
alter table public.form_submissions add constraint form_submissions_submitted_by_fkey
  foreign key (submitted_by) references public.profiles(id) on delete set null;
