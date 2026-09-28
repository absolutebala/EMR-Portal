-- Allow an expense to be logged without a project (work order). Projectless expenses
-- are scoped to the engineer's own department for the Service Manager stage, and Head
-- of Service handles the final stage as before.
ALTER TABLE public.expense_logs ALTER COLUMN work_order_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
