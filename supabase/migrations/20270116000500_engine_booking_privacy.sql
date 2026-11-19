-- App bookings in the booking engine: the booking code, the reservation name
-- and the payment state on the customer's saved list, and erasure that
-- reaches the engine when the account is deleted.
--
-- Decided with the owner on 19 Nov 2026:
--   * The booking engine keeps no contact details for a customer booking, only
--     an opaque customer reference (customer_ref: 'account_<user id>' for an
--     account, 'app_guest_<user id>' for a guest session), the name to reserve
--     under and a booking code. This is the pattern Stripe and Square use: a
--     customer id beside the payment or booking, personal details only in the
--     identity system (here, Supabase).
--   * Only the customer sees the booking's private access (customer_token),
--     as before. The customer shows the booking code; the business checks it.
--   * Every booking is paid before it is confirmed, so the list shows what is
--     still to pay and until when.
--
-- Erasure. The engine still holds the reservation name under the reference.
-- When the account is deleted, these rows go with it (on delete cascade), and
-- each (business, reference) not already forgotten is written to
-- engine_booking_erasure first. The website's bridge tells the engine to
-- forget the reference (the app also asks for this just before deleting the
-- account, and then the row is already marked forgotten_at). The queue is
-- service-only: no customer or business can read it.
--
-- Rollback:
--   drop trigger customer_engine_booking_erasure on public.customer_engine_booking;
--   drop function public.tg_customer_engine_booking_erasure();
--   drop table public.engine_booking_erasure;
--   alter table public.customer_engine_booking drop column customer_ref,
--     drop column booking_code, drop column reservation_name,
--     drop column payment_state, drop column amount_due_cents,
--     drop column hold_expires_at, drop column forgotten_at;
--   drop function public.rpc_my_engine_booking_code(uuid, text);
--   then re-run the update grant from 20270116000300.

alter table public.customer_engine_booking
  add column if not exists customer_ref text,
  add column if not exists booking_code text
    check (booking_code is null or booking_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  add column if not exists reservation_name text
    check (reservation_name is null or char_length(reservation_name) between 1 and 80),
  add column if not exists payment_state text
    check (payment_state is null or payment_state ~ '^[a-z_]{1,40}$'),
  add column if not exists amount_due_cents bigint
    check (amount_due_cents is null or amount_due_cents >= 0),
  add column if not exists hold_expires_at timestamptz,
  add column if not exists forgotten_at timestamptz;

/* A row can only name its own owner's reference, so nobody can queue another
   customer's erasure, or keep theirs out of it. */
alter table public.customer_engine_booking drop constraint if exists customer_engine_booking_ref_is_owner;
alter table public.customer_engine_booking add constraint customer_engine_booking_ref_is_owner
  check (customer_ref is null
         or customer_ref = 'account_' || user_id::text
         or customer_ref = 'app_guest_' || user_id::text);

comment on column public.customer_engine_booking.customer_ref is
  'The opaque reference the booking engine knows this customer by: account_<user id> or app_guest_<user id>.';
comment on column public.customer_engine_booking.booking_code is
  'The six-character code the customer shows at the business, as the engine last showed it: only once paid and confirmed, cleared once used (a pass keeps it while valid). Read it with rpc_my_engine_booking_code.';
comment on column public.customer_engine_booking.forgotten_at is
  'When the booking engine confirmed it forgot this customer (just before an account deletion).';

-- The summary the bridge refreshes after each read or change, plus forgotten_at.
revoke update on public.customer_engine_booking from authenticated;
grant update (status, title, starts_at, ends_at, total_cents, updated_at, booking_code,
              payment_state, amount_due_cents, hold_expires_at, forgotten_at)
  on public.customer_engine_booking to authenticated;

/*
 * The customer's own code for an app booking: null unless the engine last
 * showed it (paid, confirmed, not yet used) and the booking is still on.
 */
create or replace function public.rpc_my_engine_booking_code(p_merchant_id uuid, p_engine_booking_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.booking_code
    from public.customer_engine_booking c
   where auth.uid() is not null and c.user_id = auth.uid()
     and c.merchant_id = p_merchant_id and c.engine_booking_id = p_engine_booking_id
     and c.forgotten_at is null
     and coalesce(c.status, '') not in ('held', 'pending', 'cancelled', 'expired', 'completed', 'no-show')
     and coalesce(c.payment_state, '') <> 'awaiting_payment'
     and (c.ends_at is null or c.ends_at > now());
$$;

revoke execute on function public.rpc_my_engine_booking_code(uuid, text) from public, anon;
grant execute on function public.rpc_my_engine_booking_code(uuid, text) to authenticated;

create table public.engine_booking_erasure (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchant (id) on delete cascade,
  customer_ref  text not null check (customer_ref ~ '^(account|app_guest)_[0-9a-f-]{36}$'),
  requested_at  timestamptz not null default now(),
  done_at       timestamptz,
  attempts      integer not null default 0,
  last_error    text check (last_error is null or char_length(last_error) <= 500)
);

comment on table public.engine_booking_erasure is
  'Deleted accounts the booking engine must still forget, per business. Service only; worked by the website.';

create unique index engine_booking_erasure_open_key
  on public.engine_booking_erasure (merchant_id, customer_ref) where done_at is null;

alter table public.engine_booking_erasure enable row level security;
revoke all on public.engine_booking_erasure from public, anon, authenticated;
grant select, insert, update on public.engine_booking_erasure to service_role;

/*
 * A saved app booking is going. If its owner's sign-in is already gone (the
 * account is being deleted; the cascade runs after the auth.users row is
 * removed), queue the engine erasure, unless the engine already forgot them.
 */
create or replace function public.tg_customer_engine_booking_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.forgotten_at is null
     and not exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.engine_booking_erasure (merchant_id, customer_ref)
    values (old.merchant_id, coalesce(old.customer_ref, 'account_' || old.user_id::text))
    on conflict (merchant_id, customer_ref) where done_at is null do nothing;
  end if;
  return old;
end;
$$;

revoke execute on function public.tg_customer_engine_booking_erasure() from public, anon, authenticated;

create trigger customer_engine_booking_erasure
  after delete on public.customer_engine_booking
  for each row execute function public.tg_customer_engine_booking_erasure();

/* The website's erasure worker: the next few, oldest first, retried with a limit. */
create or replace function public.fn_engine_booking_erasure_next(p_limit integer default 20)
returns setof public.engine_booking_erasure
language sql
security definer
set search_path = ''
as $$
  update public.engine_booking_erasure e
     set attempts = e.attempts + 1
   where e.id in (
     select id from public.engine_booking_erasure
      where done_at is null and attempts < 20
      order by requested_at
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked)
  returning e.*;
$$;

create or replace function public.fn_engine_booking_erasure_done(p_id uuid, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.engine_booking_erasure
     set done_at = case when p_error is null then now() end,
         last_error = left(p_error, 500)
   where id = p_id;
$$;

revoke execute on function public.fn_engine_booking_erasure_next(integer),
  public.fn_engine_booking_erasure_done(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_engine_booking_erasure_next(integer),
  public.fn_engine_booking_erasure_done(uuid, text) to service_role;
