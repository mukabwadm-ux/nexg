-- A slot a booking left behind goes back to open.
--
-- `featured_slot_week.booking_id` is `on delete set null`, so removing
-- a booking — or the merchant it belongs to, which cascades — emptied
-- the column while leaving `status` at `live` or `booked`. That is a
-- week nobody holds, marked as sold: it would block the placement from
-- ever being re-sold, and it violates `slot_week_taken_is_attributed`
-- the moment anything touches the row.
--
-- The grid row has to survive — the schedule is materialised twelve
-- weeks ahead and deleting cells would punch holes in it — so the
-- status is reset instead of the row removed.

create or replace function public.tg_featured_release_slots()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.featured_slot_week
  set status = 'open', booking_id = null
  where booking_id = old.id;

  return old;
end;
$$;

create trigger featured_booking_release_slots
  before delete on public.featured_booking
  for each row execute function public.tg_featured_release_slots();

comment on function public.tg_featured_release_slots() is
  'A removed booking frees its weeks. Without this the FK nulls booking_id and leaves status at live — a week marked sold that nobody holds, which can never be re-sold.';
