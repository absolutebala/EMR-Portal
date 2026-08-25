-- Formalizes the attendance policy: 8:45 minimum Punch In->Punch Out duration
-- (including a 45-min lunch break), Late In after 10:00am IST, Early Out if the
-- completed duration falls short, and Single Punch if Punch Out never happens
-- before the day rolls over. All three are computed by the app (see
-- lib/mobile/core/attendance.ts), not the database — these columns just persist
-- the outcome so managers can see which rule triggered an amendment.
alter table public.attendance
  add column if not exists late_in boolean not null default false,
  add column if not exists early_out boolean not null default false,
  add column if not exists single_punch boolean not null default false;
