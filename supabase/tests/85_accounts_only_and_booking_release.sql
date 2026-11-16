-- Orders, bookings and stay holds need an account, and an unconfirmed booking
-- lets its time go.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0690000-0000-4000-8000-000000000020',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0690000-0000-4000-8000-000000000021',
   'authenticated', 'authenticated', 'first69@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0690000-0000-4000-8000-000000000022',
   'authenticated', 'authenticated', 'second69@example.test', now(), false, now(), now());

-- A business open all day, every day, whose service waits for it to confirm.
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c0690000-0000-4000-8000-00000000000a', '[Legal 69] Ltd', '[Salon 69]', 'restaurant',
        '[Contact]', '+254700006900', 'salon69@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select 'c0690000-0000-4000-8000-00000000000a', d, '00:00', '00:00' from generate_series(0, 6) d;
insert into public.bookable_resource (id, merchant_id, model, name, price_cents, duration_minutes,
                                      instant_confirm, active)
values ('c0690000-0000-4000-8000-0000000000b1', 'c0690000-0000-4000-8000-00000000000a', 'exclusive',
        '[Chair 1]', 100000, 60, false, true);

-- A home that takes stays.
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c0690000-0000-4000-8000-0000000000c0', 'multi_unit', '[Host 69]', '+254700069000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c0690000-0000-4000-8000-0000000000c1', 'c0690000-0000-4000-8000-0000000000c0',
        'block-69', '[Block 69]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('c0690000-0000-4000-8000-0000000000c2', 'c0690000-0000-4000-8000-0000000000c0',
        'c0690000-0000-4000-8000-0000000000c1', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000);

-- ── a temporary session, with no account

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0690000-0000-4000-8000-000000000020","role":"authenticated","is_anonymous":true}', true);

select throws_ok($$select public.rpc_order_place_web('{}'::jsonb)$$,
  '42501', 'Sign in with your account to place your order.',
  'A temporary session cannot place an order.');
select throws_ok(
  $$select public.rpc_booking_create('c0690000-0000-4000-8000-0000000000b1',
      (current_date + 2)::timestamptz + interval '10 hours')$$,
  '28000', 'Sign in with your account to book',
  'Nor take a booking.');
select throws_ok(
  $$select public.rpc_stay_hold('c0690000-0000-4000-8000-0000000000c2', current_date + 10, current_date + 12)$$,
  '42501', 'Sign in with your account to hold these dates.',
  'Nor hold a stay''s dates.');

-- ── accounts

select set_config('request.jwt.claims',
  '{"sub":"c0690000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.first',
  (public.rpc_booking_create('c0690000-0000-4000-8000-0000000000b1',
     (current_date + 2)::timestamptz + interval '10 hours')).id::text, true);
reset role;

select is((select status::text from public.booking where id = current_setting('t.first')::uuid),
  'pending', 'With an account, the booking is made and waits for the business.');

-- A day and an hour later the business still has not answered.
update public.booking set created_at = now() - interval '25 hours'
 where id = current_setting('t.first')::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0690000-0000-4000-8000-000000000022","role":"authenticated"}', true);
select set_config('t.second',
  (public.rpc_booking_create('c0690000-0000-4000-8000-0000000000b1',
     (current_date + 2)::timestamptz + interval '10 hours')).id::text, true);
reset role;

select isnt(current_setting('t.second'), '', 'The same time can be booked again: the unanswered booking no longer holds it.');
select is(
  (select status::text || ' ' || (expired_at is not null)::text from public.booking
    where id = current_setting('t.first')::uuid),
  'cancelled true', 'The unanswered booking was released, and says when.');

-- A pending booking whose start time has passed.
insert into public.booking (id, resource_id, starts_at, ends_at, status, guest_user_id, source, merchant_id, held_during)
values ('c0690000-0000-4000-8000-0000000000d1', 'c0690000-0000-4000-8000-0000000000b1',
        now() - interval '2 hours', now() - interval '1 hour', 'pending',
        'c0690000-0000-4000-8000-000000000021', 'app', 'c0690000-0000-4000-8000-00000000000a',
        tstzrange(now() - interval '2 hours', now() - interval '1 hour'));

select cmp_ok(public.fn_booking_release_stale(), '>=', 1, 'The release run finds work to do.');
select is((select status::text from public.booking where id = 'c0690000-0000-4000-8000-0000000000d1'),
  'cancelled', 'A pending booking whose time has come is released.');
select is((select status::text from public.booking where id = current_setting('t.second')::uuid),
  'pending', 'A booking made just now keeps waiting for the business.');

-- Asked through dynamic SQL, so the file still runs where pg_cron is absent.
create function pg_temp.cron_job_ok(p_name text) returns boolean language plpgsql as $$
declare v_found boolean;
begin
  if to_regclass('cron.job') is null then
    return true;
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into v_found using p_name;
  return v_found;
end
$$;
select ok(pg_temp.cron_job_ok('booking-release-stale'),
  'The release runs every five minutes wherever pg_cron is installed.');

select * from finish();
rollback;
