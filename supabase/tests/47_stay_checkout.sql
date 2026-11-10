-- Stay booking, phase 2: paying for a held stay.
--
-- The guest's payment is opened for exactly the held total, and the stay is
-- confirmed only when the payment settles. The money is split 85/15 on the
-- stay, the host is told, and a payment that lands after somebody else took
-- the dates is kept and flagged for a refund rather than double-booking.

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ─────────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d4700000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest47@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4700000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other47@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4700000-0000-4000-8000-000000000003',
   'authenticated','authenticated',null,null,true,now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d4710000-0000-4000-8000-00000000000a','multi_unit','[Host 47]','+254700047000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d4720000-0000-4000-8000-00000000000a','d4710000-0000-4000-8000-00000000000a',
        'block-47','[Block 47]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d4730000-0000-4000-8000-00000000000a','d4710000-0000-4000-8000-00000000000a',
        'd4720000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 7000);

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

/* Settle a payment the way the M-Pesa and Paystack callbacks do. */
create function pg_temp.settle(p_reference text, p_amount bigint) returns jsonb
language sql as $$
  select public.rpc_payment_webhook(
    p_event => 'test.settled', p_reference => p_reference,
    p_dedupe_key => 'test:' || p_reference || ':' || p_amount, p_signature_ok => true,
    p_payload => '{}'::jsonb, p_paid => true, p_provider_ref => 'TEST-' || p_reference,
    p_amount_cents => p_amount, p_channel => 'mpesa')
$$;

-- ══════════════════════════════════════════════ 1. opening the payment

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into t (k, v)
select 'stay', public.rpc_stay_hold('d4730000-0000-4000-8000-00000000000a',
  (select today + 10 from d), (select today + 12 from d), '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';

insert into t (k, v)
select 'pay', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay'))::text;

select is((select (v::jsonb ->> 'amount_cents')::bigint from t where k = 'pay'), 1400000::bigint,
  'The payment is for exactly the held total: 2 nights × 7,000, in cents.');

select is(
  public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay')) ->> 'reference',
  (select v::jsonb ->> 'reference' from t where k = 'pay'),
  'Asking again reuses the open payment instead of making a second one.');

select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  format($$ select public.rpc_payment_begin_stay(%L) $$, (select v from t where k = 'stay')),
  '42501', 'That stay is not yours.',
  'Nobody else can open a payment on the guest''s stay.');
select throws_ok(
  format($$ select public.rpc_stay_checkout_status(%L) $$, (select v from t where k = 'stay')),
  '42501', 'That stay is not yours.',
  'Or see where it stands.');

select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t (k, v)
select 'anon_stay', public.rpc_stay_hold('d4730000-0000-4000-8000-00000000000a',
  (select today + 50 from d), (select today + 51 from d)) ->> 'stay_id';
select throws_ok(
  format($$ select public.rpc_payment_begin_stay(%L) $$, (select v from t where k = 'anon_stay')),
  '42501', 'Sign in with your email to book, so we can send your confirmation.',
  'An anonymous session can hold dates but must sign in with an email to pay.');

reset role;

select is(
  (select intent::text || '/' || state::text || '/' || (stay_id = (select v::uuid from t where k = 'stay'))::text
     from public.payment where reference = (select v::jsonb ->> 'reference' from t where k = 'pay')),
  'stay/pending/true',
  'The payment is a pending stay payment pointing at the stay.');

/* A hold close to running out is stretched when the payment opens. */
update public.stay set hold_expires_at = now() + interval '2 minutes'
 where id = (select v::uuid from t where k = 'stay');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay'));
reset role;
select is(
  (select hold_expires_at from public.stay where id = (select v::uuid from t where k = 'stay')),
  now() + interval '10 minutes',
  'A hold with two minutes left is stretched to ten while the guest pays.');

-- ═══════════════════════════════════════ 2. a wrong amount changes nothing

select is(
  pg_temp.settle((select v::jsonb ->> 'reference' from t where k = 'pay'), 100) ->> 'reason',
  'amount_mismatch',
  'A settlement for the wrong amount is refused.');
select is(
  (select status from public.stay where id = (select v::uuid from t where k = 'stay')),
  'held',
  'And the stay stays held.');

-- ═══════════════════════════════════════════ 3. paid → booked, money split

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t (k, v)
select 'stay2', public.rpc_stay_hold('d4730000-0000-4000-8000-00000000000a',
  (select today + 20 from d), (select today + 23 from d), '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t (k, v)
select 'pay2', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay2'))::text;
reset role;

select is(
  pg_temp.settle((select v::jsonb ->> 'reference' from t where k = 'pay2'), 2100000) ->> 'state',
  'paid',
  'The right amount settles the payment.');

select is(
  (select status || ' ' || paid_kes || ' ' || commission_kes || ' ' || host_share_kes
     from public.stay where id = (select v::uuid from t where k = 'stay2')),
  'booked 21000 3150 17850',
  'The stay is booked: guest paid 21,000, NexG keeps 15% (3,150), the host''s share is 17,850.');

select ok(
  (select confirmed_at is not null and payment_reference = (select v::jsonb ->> 'reference' from t where k = 'pay2')
     from public.stay where id = (select v::uuid from t where k = 'stay2')),
  'It records when it was confirmed and by which payment.');

select is(
  (select count(*)::int from public.host_message
    where host_id = 'd4710000-0000-4000-8000-00000000000a' and subject = 'New NexG booking'),
  1,
  'The host is told about the booking.');

select is(
  pg_temp.settle((select v::jsonb ->> 'reference' from t where k = 'pay2'), 2100000) ->> 'duplicate',
  'true',
  'A repeated callback does nothing twice.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  public.rpc_stay_checkout_status((select v::uuid from t where k = 'stay2')) ->> 'status',
  'booked',
  'The guest sees their stay as booked.');

select is(public.rpc_stay_confirmation_sent((select v::uuid from t where k = 'stay2')), true,
  'The first ask to send the confirmation email gets it.');
select is(public.rpc_stay_confirmation_sent((select v::uuid from t where k = 'stay2')), false,
  'Every later ask does not, so the email goes once.');

select throws_ok(
  format($$ select public.rpc_payment_begin_stay(%L) $$, (select v from t where k = 'stay2')),
  '22023', 'That stay is already paid and confirmed.',
  'A paid stay cannot be paid again.');

-- ═══════════════════════════════════════════════════ 4. a payment that is late

insert into t (k, v)
select 'stay3', public.rpc_stay_hold('d4730000-0000-4000-8000-00000000000a',
  (select today + 30 from d), (select today + 32 from d)) ->> 'stay_id';
insert into t (k, v)
select 'pay3', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay3'))::text;
reset role;

/* The hold runs out before M-Pesa answers, and somebody else takes the nights. */
update public.stay set hold_expires_at = now() - interval '1 minute'
 where id = (select v::uuid from t where k = 'stay3');
select public.fn_stay_release_expired_holds();

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4700000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.rpc_stay_hold('d4730000-0000-4000-8000-00000000000a',
       (select today + 30 from d), (select today + 32 from d)) $$,
  'Once the first hold has gone, another guest can take the same nights.');
reset role;

select is(
  pg_temp.settle((select v::jsonb ->> 'reference' from t where k = 'pay3'), 1400000) ->> 'state',
  'paid',
  'The first guest''s late payment is still recorded as paid: the money did move.');

select ok(
  (select status = 'cancelled' and refund_due_at is not null and paid_kes = 14000
     from public.stay where id = (select v::uuid from t where k = 'stay3')),
  'But their stay is not double-booked: it is marked refund due for staff.');

select is(
  (select count(*)::int from public.stay
    where unit_id = 'd4730000-0000-4000-8000-00000000000a'
      and guest_user_id = 'd4700000-0000-4000-8000-000000000002' and status = 'held'),
  1,
  'And the second guest keeps their hold.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and (finding ilike '%stay%' or finding ilike '%payment_begin%')),
  0,
  'Every new function is audited or exempt with a reason, and anon can run none of them.');

select * from finish();
rollback;
