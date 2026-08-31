-- Data cleanup: a work order whose engineer was deleted kept its 'assigned' /
-- 'in_progress' status while work_orders.engineer_id was nulled by the ON DELETE SET
-- NULL rule — so the UI showed "Unassigned" for the engineer but "Assigned" for the
-- status, which is contradictory. Revert any such orphaned open work order back to
-- 'unassigned' (matching what updateWorkOrder already does when an engineer is removed
-- through the UI). Terminal statuses (completed/pending) and needs_reassignment are
-- left as-is — a completed job legitimately has no current engineer.
update public.work_orders
set status = 'unassigned', updated_at = now()
where engineer_id is null and status in ('assigned', 'in_progress');
