-- Add a 'closed' terminal status for notifications. Flow: a field engineer marks a
-- notification 'completed' from the mobile app, then a Service Manager reviews it on the
-- web and closes it (status 'closed'). Widens the existing status check (last set in 025).
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check
  CHECK (status IN ('unassigned', 'assigned', 'in_progress', 'pending', 'completed', 'needs_reassignment', 'closed'));
