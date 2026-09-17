-- Apply-for-Leave requests. Separate from the daily `attendance` table: an engineer
-- picks a From/To date range and a reason, which a manager (Attendance — Approve
-- permission) approves or rejects. On an approved range, each covered date reads
-- "On Leave" in the attendance views UNLESS the engineer actually punches in that day
-- (a site visit during leave) — the punch-in row then wins and the day shows Site
-- Visit/Travel. All computed on read in lib/mobile/core/attendance.ts; no row is
-- written into `attendance` for a leave day.
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  engineer_id uuid not null references public.profiles(id),
  from_date date not null,
  to_date date not null,
  reason text not null,
  -- 'pending' until a manager acts; only 'approved' ranges affect the attendance view.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index leave_requests_engineer_idx on public.leave_requests (engineer_id);
create index leave_requests_status_idx on public.leave_requests (status);
create index leave_requests_range_idx on public.leave_requests (from_date, to_date);
