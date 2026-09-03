-- Field-engineer-created notifications need manager sign-off before any expense can be
-- logged against them. expense_approval is NULL for the normal case (created by an
-- admin/manager on the web — expenses behave exactly as before); it is set to 'pending'
-- when a Field Engineer creates a notification from the mobile app. A Service Manager /
-- Head of Service then moves it to 'approved' or 'rejected'. Expense creation is blocked
-- while the value is 'pending' or 'rejected'; a rejected notification stays in the list
-- and can still be approved later. expense_approval_by / _at capture the decision for the
-- activity log.
ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS expense_approval TEXT
    CHECK (expense_approval IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS expense_approval_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_approval_at TIMESTAMPTZ;
