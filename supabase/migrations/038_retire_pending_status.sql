-- "Pending" is no longer a distinct notification status — a visit that couldn't be
-- finished in a day now keeps the notification "in_progress", with scheduled_date
-- carrying the follow-up date instead of a separate Pending bucket (see
-- submitDailyClosure in app/actions/mobile-actions.ts). Backfill existing rows so
-- the UI is consistent immediately for jobs already sitting in "pending", not just
-- for newly-submitted closures going forward. Jobs flagged needs_reassignment are
-- untouched — that status is unchanged.
UPDATE public.work_orders wo
SET status = 'in_progress',
    scheduled_date = COALESCE(
      (SELECT c.revisit_date FROM public.work_order_daily_closures c
       WHERE c.work_order_id = wo.id ORDER BY c.created_at DESC LIMIT 1),
      wo.scheduled_date
    ),
    updated_at = NOW()
WHERE wo.status = 'pending';
