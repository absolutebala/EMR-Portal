-- Field engineer daily attendance. A row only exists once an engineer actually marks
-- present (on-time or as a late "amendment" of an implicit auto-Leave) — an unmarked
-- day is never written as an explicit Leave row, it's computed on read (see
-- lib/mobile/core/attendance.ts). Marking is an upsert by (engineer_id,
-- attendance_date): a rejected amendment can be re-attempted the same day, which
-- updates this same row rather than inserting a second one.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.profiles(id),
  attendance_date date not null,
  status text not null check (status in ('present', 'leave')),
  marked_at timestamptz,
  latitude numeric,
  longitude numeric,
  place_name text,
  -- Required when marking after the 11am IST cutoff (an "amendment" of an implicit
  -- auto-Leave) — null for a normal on-time marking.
  reason text,
  -- null = on-time marking, no approval needed. 'pending'/'rejected' both still
  -- display as Leave until a Service Manager approves.
  approval_status text check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engineer_id, attendance_date)
);
create index attendance_engineer_date_idx on public.attendance (engineer_id, attendance_date);

-- A day with no attendance marked but a matching holiday row shows the holiday name
-- instead of "Leave" (Sundays are treated as a non-working day too, computed directly
-- from the date — no row needed for those).
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
