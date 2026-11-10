-- Stay refunds: what goes into the queue, who sees it, and how a refund is recorded.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ─────────────────────────────────────────────────────────── fixtures

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d4800000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest48@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4800000-0000-4000-8000-000000000002',
   'authenticated','authenticated','late48@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4800000-0000-4000-8000-0000000000aa',
   'authenticated','authenticated','partners48@nexgapp.com',now(),false,now(),now());

insert into public.staff_user (id, user_id, email, display_name)
values ('d48000aa-0000-4000-8000-00000000000a','d4800000-0000-4000-8000-0000000000aa',
        'partners48@nexgapp.com','Partnerships 48');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'partners48@nexgapp.com';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d4810000-0000-4000-8000-00000000000a','multi_unit','[Host 48]','+254700048000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d4820000-0000-4000-8000-00000000000a','d4810000-0000-4000-8000-00000000000a',
        'block-48','[Block 48]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d4830000-0000-4000-8000-00000000000a','d4810000-0000-4000-8000-00000000000a',
        'd4820000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);

create temp table t (k text primary key, v text);
create temp table d as select (now() at time zone 'Africa/Nairobi')::date as today;
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to authenticated;
grant all on t to authenticated;

create function pg_temp.settle(p_reference text, p_amount bigint) returns jsonb
language sql as $$
  select public.rpc_payment_webhook(
    p_event => 'test.settled', p_reference => p_reference,
    p_dedupe_key => 'test:' || p_reference, p_signature_ok => true,
    p_payload => '{}'::jsonb, p_paid => true, p_provider_ref => 'TEST-' || p_reference,
    p_amount_cents => p_amount, p_channel => 'mpesa')
$$;

/* A guest books and pays two nights (10,000). */
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t (k, v) select 'paid', public.rpc_stay_hold('d4830000-0000-4000-8000-00000000000a',
  (select today + 10 from d), (select today + 12 from d), '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t (k, v) select 'pay', public.rpc_payment_begin_stay((select v::uuid from t where k = 'paid')) ->> 'reference';
reset role;
select pg_temp.settle((select v from t where k = 'pay'), 1000000);
update public.payment set provider_receipt = 'SKL1234ABC', payer_phone = '254712345678'
 where reference = (select v from t where k = 'pay');

/* Another guest pays late, after the dates went to somebody else. */
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4800000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into t (k, v) select 'late', public.rpc_stay_hold('d4830000-0000-4000-8000-00000000000a',
  (select today + 20 from d), (select today + 21 from d)) ->> 'stay_id';
insert into t (k, v) select 'latepay', public.rpc_payment_begin_stay((select v::uuid from t where k = 'late')) ->> 'reference';
reset role;
update public.stay set hold_expires_at = now() - interval '1 minute' where id = (select v::uuid from t where k = 'late');
select public.fn_stay_release_expired_holds();
insert into public.stay (host_id, unit_id, check_in, check_out, source, status)
select 'd4810000-0000-4000-8000-00000000000a', unit_id, check_in, check_out, 'entered', 'booked'
  from public.stay where id = (select v::uuid from t where k = 'late');
select pg_temp.settle((select v from t where k = 'latepay'), 500000);

-- ══════════════════════════════════════════════ 1. what goes in the queue

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4800000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.rpc_stay_refunds('due') where host = '[Host 48]'),
  1,
  'Only the late payment is due a refund; the paid booking is not.');

select is(
  (select reason || ' ' || paid_kes from public.rpc_stay_refunds('due') where host = '[Host 48]'),
  'late_payment 5000',
  'It says why and how much.');

select lives_ok(
  format($$ select public.rpc_stay_cancel(%L, 'Host double-booked it') $$, (select v from t where k = 'paid')),
  'Staff can cancel a paid NexG booking.');

select is(
  (select reason || ' ' || paid_kes || ' ' || mpesa_receipt
     from public.rpc_stay_refunds('due') where stay_id = (select v::uuid from t where k = 'paid')),
  'cancelled 10000 SKL1234ABC',
  'And cancelling it puts it in the queue with the M-Pesa receipt to reverse.');

select is(
  (select payer_phone || ' ' || guest_email
     from public.rpc_stay_refunds('due') where stay_id = (select v::uuid from t where k = 'paid')),
  '25471•••78 gu•••@example.test',
  'Partnerships staff see the payer''s phone and email masked.');

-- ══════════════════════════════════════════════ 2. recording a refund

select throws_ok(
  format($$ select public.rpc_stay_refund_record(%L, '  ') $$, (select v from t where k = 'paid')),
  '22023', 'Enter the M-Pesa reference of the refund.',
  'A refund needs the reference of the money that went back.');

select is(
  (select refund_reference from public.rpc_stay_refund_record(
     (select v::uuid from t where k = 'paid'), 'skr9xy12', 'Reversed in the M-Pesa portal')),
  'SKR9XY12',
  'Recording it stores the reference.');

select throws_ok(
  format($$ select public.rpc_stay_refund_record(%L, 'AGAIN') $$, (select v from t where k = 'paid')),
  '22023', null,
  'A refund is recorded once.');

select is(
  (select count(*)::int from public.rpc_stay_refunds('due') where host = '[Host 48]'),
  1,
  'The refunded stay leaves the due list.');

select is(
  (select refunded_by from public.rpc_stay_refunds('refunded') where stay_id = (select v::uuid from t where k = 'paid')),
  'Partnerships 48',
  'And shows under refunded, with who recorded it.');

select throws_ok(
  format($$ select public.rpc_stay_refund_record(%L, 'X1') $$,
    (select id from public.stay where host_id = 'd4810000-0000-4000-8000-00000000000a'
        and source = 'entered' limit 1)),
  '22023', 'That stay has no refund due.',
  'A stay with nothing due cannot be marked refunded.');

reset role;

select is(
  (select state::text from public.payment where reference = (select v from t where k = 'pay')),
  'reversed',
  'The payment is marked reversed.');

-- ══════════════════════════════════════════════ 3. who can see it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.rpc_stay_refunds('due') $$,
  '42501', 'Hospitality staff only.',
  'A guest cannot read the refund queue.');
select throws_ok(
  format($$ select public.rpc_stay_refund_record(%L, 'X') $$, (select v from t where k = 'late')),
  '42501', 'Hospitality staff only.',
  'Or record a refund.');
reset role;

select * from finish();
rollback;
