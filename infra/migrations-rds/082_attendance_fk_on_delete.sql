-- Deleting a user failed on attendance_engineer_id_fkey: the attendance table's two
-- FKs to profiles had no ON DELETE clause (default NO ACTION), so any engineer with a
-- single attendance row could never be deleted. Every other profiles-referencing FK
-- already cascades (owned rows) or sets null (attribution) — these two were the last
-- holdouts. engineer_id is the row's owner, so its records go with the user (CASCADE);
-- approved_by is just who approved an amendment, so keep the row and null it (SET NULL).
alter table public.attendance drop constraint attendance_engineer_id_fkey;
alter table public.attendance add constraint attendance_engineer_id_fkey
  foreign key (engineer_id) references public.profiles(id) on delete cascade;

alter table public.attendance drop constraint attendance_approved_by_fkey;
alter table public.attendance add constraint attendance_approved_by_fkey
  foreign key (approved_by) references public.profiles(id) on delete set null;
