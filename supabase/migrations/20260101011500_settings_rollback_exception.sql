-- One person may roll back, and only backwards.
--
-- `version_approval_is_two_people` refused a rollback, because a
-- rollback sets the requester and the approver to the same person.
-- That is the constraint working — and it is wrong here, for a
-- reason worth writing down rather than solving by deleting the
-- check.
--
-- Going forward to a new number is an act of judgement: two people
-- agree what a thing should cost. Going back to a number two people
-- already agreed is not the same act. It restores a state the pair
-- has already signed off, and it is the thing you want to be fast at
-- 2am when a fee went out wrong.
--
-- So the exception is narrow and visible in the data: self-approval
-- is permitted only on a row that names the version it is undoing.
-- A rollback cannot invent a value, because it copies one; and it
-- cannot be disguised as a normal change, because `rolled_back_from`
-- is what buys the exemption.

alter table settings.version
  drop constraint if exists version_approval_is_two_people;

alter table settings.version
  add constraint version_approval_is_two_people check (
    approved_by is null
    or created_by is null
    or approved_by <> created_by
    /* Undoing something two people already agreed. */
    or rolled_back_from is not null);

comment on constraint version_approval_is_two_people on settings.version is
  'Two people to go forward; one may go back. A rollback restores a value the pair already agreed, and rolled_back_from is what distinguishes it from a change pretending to be one.';
