-- form_submissions: stores filled form data submitted by field engineers.
-- form_data JSONB structure:
--   { "fields": { "<field_id>": "<value>" },
--     "table_rows": { "<row_id>": { "status": "yes|no|tested|not_tested|checked", "remarks": "<text>" } } }

create table if not exists public.form_submissions (
  id           uuid        primary key default gen_random_uuid(),
  work_order_id uuid       not null references public.work_orders(id) on delete cascade,
  form_id       uuid       not null references public.forms(id) on delete cascade,
  submitted_by  uuid       references public.profiles(id),
  form_data     jsonb      not null default '{}',
  status        text       not null default 'submitted' check (status in ('draft', 'submitted')),
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
