-- Field Engineers no longer report to one fixed Service Manager (any Service
-- Manager can be handed any Field Engineer's job) — drop the mandatory Reporting
-- Manager requirement for that role. Service Manager -> Head of Service stays
-- required, unchanged.
UPDATE public.roles SET requires_manager = false WHERE name = 'Field Engineer';

-- Departments move to the notification itself, tagged by whichever Service
-- Manager (or other role) creates it, rather than derived from the assigned
-- Field Engineer (who no longer carries a department for this purpose).
ALTER TABLE public.work_orders ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
