-- Two-stage expense approval: Service Manager approves first (-> manager_approved),
-- then Head of Service gives the final approval (-> approved). Either stage can
-- reject outright, which is final. reviewed_by/reviewed_at now mean "whoever made
-- the final call" (final approval, or a rejection at either stage); the new
-- manager_approved_by/at columns capture the first-stage decision specifically so
-- both stages stay visible in the UI.
alter table public.expense_logs drop constraint if exists expense_logs_status_check;
alter table public.expense_logs add constraint expense_logs_status_check
  check (status in ('pending', 'manager_approved', 'approved', 'rejected'));

alter table public.expense_logs add column manager_approved_by uuid references public.profiles(id) on delete set null;
alter table public.expense_logs add column manager_approved_at timestamptz;

update public.roles
set permissions = permissions || '{"Expenses — Final Approve": true}'::jsonb
where name in ('Super Admin', 'Head of Service');
