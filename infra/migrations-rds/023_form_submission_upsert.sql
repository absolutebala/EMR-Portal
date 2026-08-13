-- Keep only the most recent submission per (work_order_id, form_id) before adding the
-- uniqueness constraint, since submit-form previously did a plain insert (no upsert),
-- which could have produced duplicates for a work order visited more than once.
delete from public.form_submissions a
using public.form_submissions b
where a.work_order_id = b.work_order_id
  and a.form_id = b.form_id
  and a.submitted_at < b.submitted_at;

alter table public.form_submissions
  add constraint form_submissions_wo_form_unique unique (work_order_id, form_id);
