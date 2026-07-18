-- Separate from wo_number (the existing free-text reference number, kept as-is) —
-- ticket_number is auto-generated in DDMMYYYY-N format, N resetting each day,
-- computed at creation time (see nextTicketNumber() in create-work-order.ts).
alter table public.work_orders add column ticket_number text;

-- Backfill existing rows so historical work orders get a coherent ticket_number
-- too, numbered sequentially within their own creation date.
with numbered as (
  select id,
    to_char(created_at, 'DDMMYYYY') || '-' || row_number() over (
      partition by to_char(created_at, 'DDMMYYYY') order by created_at
    ) as generated_ticket_number
  from public.work_orders
)
update public.work_orders w
set ticket_number = n.generated_ticket_number
from numbered n
where w.id = n.id;

alter table public.work_orders alter column ticket_number set not null;
alter table public.work_orders add constraint work_orders_ticket_number_key unique (ticket_number);
