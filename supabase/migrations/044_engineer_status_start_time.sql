-- Lets an engineer commit to a start time when setting status to On the way /
-- Travelling ("I will start by ___"), and captures where they were standing at that
-- moment so a later check (checkNotStartedFollowUp in mobile-actions.ts) can tell
-- whether they've actually moved by the time that commitment passes.
alter table public.profiles add column engineer_status_start_by timestamptz;
alter table public.profiles add column engineer_status_set_lat numeric;
alter table public.profiles add column engineer_status_set_lng numeric;
