-- A rider's special early payout (finance approves, pays, and the next weekly
-- run takes it off) and a payout phone change confirmed by SMS code.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider113@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'finance113@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver113@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1130000-0000-4000-8000-0000000000b1', 'c1130000-0000-4000-8000-000000000006', 'finance113@test.local', 'Finance 113'),
  ('c1130000-0000-4000-8000-0000000000b2', 'c1130000-0000-4000-8000-000000000007', 'approver113@test.local', 'Approver 113');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1130000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1130000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'finance';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, payout_msisdn)
values ('c1130000-0000-4000-8000-000000000031', 'c1130000-0000-4000-8000-000000000003',
        '[Rider]', '[113]', '+254700011302', (select id from public.city where slug = 'nairobi'),
        'motorbike', '[PLATE113]', 'active', 'offline', now(), '+254700011302');

-- Earned 900 since the last run, and holding 200 of cash.
insert into public.rider_earning (rider_id, order_reference, base_kes, total_kes, earned_at)
values ('c1130000-0000-4000-8000-000000000031', '[PAY-113-1]', 500, 500, now()),
       ('c1130000-0000-4000-8000-000000000031', '[PAY-113-2]', 400, 400, now());
insert into public.cash_event (rider_id, kind, amount_kes, order_reference)
values ('c1130000-0000-4000-8000-000000000031', 'collected', 200, '[PAY-113-2]');

create function pg_temp.as_user(p_uid text, p_anonymous boolean default false) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true)
$$;

create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlerrm);
end
$$;

-- ── what can be asked for

set local role authenticated;
select pg_temp.as_user('c1130000-0000-4000-8000-000000000003');
select is((public.rpc_rider_payout_overview() ->> 'availableKes')::int, 700,
  'Earned 900, holding 200 of cash: 700 can be asked for.');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(50)$$), 'below_minimum',
  'Too small is refused.');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(800)$$), 'above_available',
  'More than is available is refused.');
select is(public.rpc_rider_payout_request(600, '[School fees]') ->> 'status', 'pending',
  'The rider asks for 600.');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(100)$$), 'request_open',
  'One request at a time.');
select is((public.rpc_rider_payout_overview() ->> 'availableKes')::int, 100,
  'What is asked for is held back.');
select throws_ok(format($$select public.rpc_finance_rider_payout_decide(%L, 'approve')$$,
  (select id from public.rider_payout_request where rider_id = 'c1130000-0000-4000-8000-000000000031')),
  '42501', null, 'The rider cannot approve it.');

-- ── finance answers

select pg_temp.as_user('c1130000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.rider_payout_request_queue_v
            where rider_id = 'c1130000-0000-4000-8000-000000000031' and status = 'pending'),
  1, 'Finance sees it in their queue.');
select is(pg_temp.hint_of(format($$select public.rpc_finance_rider_payout_decide(%L, 'paid', null, 'QX1')$$,
  (select id from public.rider_payout_request_queue_v where rider_id = 'c1130000-0000-4000-8000-000000000031'))),
  'Approve it before recording the payment.', 'It cannot be paid before it is approved.');
select is(public.rpc_finance_rider_payout_decide(
  (select id from public.rider_payout_request_queue_v where rider_id = 'c1130000-0000-4000-8000-000000000031'),
  'approve') ->> 'status', 'approved', 'Finance approves.');
select is(public.rpc_finance_rider_payout_decide(
  (select id from public.rider_payout_request_queue_v where rider_id = 'c1130000-0000-4000-8000-000000000031'),
  'paid', null, '[QX12345]') ->> 'status', 'paid', 'And records the M-Pesa payment.');
reset role;

select is((select amount_kes::int from public.rider_adjustment
            where rider_id = 'c1130000-0000-4000-8000-000000000031' and kind = 'early_payout'),
  -600, 'The next weekly run takes the 600 off.');

set local role authenticated;
select pg_temp.as_user('c1130000-0000-4000-8000-000000000003');
select is((public.rpc_rider_payout_overview() ->> 'availableKes')::int, 100,
  'After the payment, 100 is left.');
select is((public.rpc_rider_payout_overview() -> 'requests' -> 0 ->> 'providerRef'),
  '[QX12345]', 'The rider sees the payment and its reference.');

-- ── a new payout phone, by SMS code

select is(pg_temp.hint_of($$select public.rpc_rider_phone_change_start('payout', '123')$$), 'bad_phone',
  'A number that is not Kenyan mobile is refused.');
select set_config('t.change', public.rpc_rider_phone_change_start('payout', '0711 222 333') ->> 'challengeId', true);
select ok(current_setting('t.change') is not null, 'A code is sent to the new number.');
reset role;

select is((select count(*)::int from public.rider_phone_change where id = current_setting('t.change')::uuid
            and new_phone = '+254711222333'),
  1, 'The number is stored in full form.');
-- The test reads the code's hash only to plant a known code; nobody else can.
update public.rider_phone_change
   set code_hash = encode(extensions.digest('123456', 'sha256'), 'hex')
 where id = current_setting('t.change')::uuid;

set local role authenticated;
select pg_temp.as_user('c1130000-0000-4000-8000-000000000003');
select is(public.rpc_rider_phone_change_verify(current_setting('t.change')::uuid, '000000') ->> 'reason',
  'wrong_code', 'A wrong code is refused.');
select is(public.rpc_rider_phone_change_verify(current_setting('t.change')::uuid, '123456') ->> 'phone',
  '+254711222333', 'The right code changes the payout number.');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(100)$$), 'payout_phone_recent',
  'Early payouts wait a day after the number changes.');
reset role;

select * from finish();
rollback;
