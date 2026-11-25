-- A customer's own cinema holds and bookings, newest first
-- (cinema-app-contract v3, step 4b).
--
-- The app's Activity tab knew only the holds made on that phone, so a second
-- phone showed none. This lists every hold and booking of the signed-in
-- customer, in every state (held, paying, confirming, confirmed, released,
-- expired, refund_due, refunded), each in the same shape rpc_my_cinema_hold
-- returns, so the app reuses its view.
--
-- Paged newest first by a cursor of (created_at, id): ask again with the
-- `next` the answer gives, until it is null. At most 50 at a time.
--
-- Only the caller's own rows (cinema.hold.guest_id = auth.uid()). Signed out
-- is refused. A guest (temporary) session reads its own, as with the single
-- read.
--
-- Rollback:
--   drop function if exists public.rpc_my_cinema_holds(integer, timestamptz, uuid);
--   drop index if exists cinema.cinema_hold_guest_recent_idx;

create index if not exists cinema_hold_guest_recent_idx
  on cinema.hold (guest_id, created_at desc, id desc);

create or replace function public.rpc_my_cinema_holds(
  p_limit integer default 20,
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_holds jsonb;
  v_last_at timestamptz;
  v_last_id uuid;
  v_more boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to see your tickets.' using errcode = '42501';
  end if;
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'A page cursor needs both its time and its id.' using errcode = '22023';
  end if;

  with page as (
    select h.id, h.created_at
      from cinema.hold h
     where h.guest_id = v_uid
       and (p_before is null or (h.created_at, h.id) < (p_before, p_before_id))
     order by h.created_at desc, h.id desc
     limit v_limit
  )
  select coalesce(jsonb_agg(r.hold order by p.created_at desc, p.id desc) filter (where r.hold is not null),
                  '[]'::jsonb),
         (array_agg(p.created_at order by p.created_at, p.id))[1],
         (array_agg(p.id order by p.created_at, p.id))[1]
    into v_holds, v_last_at, v_last_id
    from page p
   cross join lateral (select cinema.connected_hold_result(p.id) as hold) r;

  -- The oldest row on this page is the cursor for the next, if anything is older.
  if v_last_id is not null then
    v_more := exists (select 1 from cinema.hold h
                       where h.guest_id = v_uid and (h.created_at, h.id) < (v_last_at, v_last_id));
  end if;

  return jsonb_build_object(
    'holds', v_holds,
    'next', case when v_more then jsonb_build_object('before', v_last_at, 'beforeId', v_last_id) end);
end;
$$;

comment on function public.rpc_my_cinema_holds(integer, timestamptz, uuid) is
  'The signed-in customer''s own cinema holds and bookings, newest first, in the shape of rpc_my_cinema_hold; paged by next {before, beforeId}.';

revoke all on function public.rpc_my_cinema_holds(integer, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_my_cinema_holds(integer, timestamptz, uuid) to authenticated;
