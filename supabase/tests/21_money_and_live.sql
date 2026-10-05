-- Taking money, and the ways that could go wrong quietly.
--
-- The dangerous failures in a payment rail are not the ones that
-- error. They are the ones that look like success:
--
--   * the same webhook delivered twice, charging an order twice
--   * a provider settling a different figure from the one asked
--     for, and nobody comparing
--   * a forged webhook moving an order to paid
--   * a refund marked sent that never left
--   * two checkouts open on one order, so a guest pays twice
--
-- Each of those is a test here. None of them is about whether the
-- happy path works.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create temp table t (k text primary key, v text);
/* The suite switches roles, and the fixture ids live in here. */
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('city', (select id::text from public.city where name = 'Nairobi')),
  ('admin', (select id::text from public.staff_user where email = 'dev.admin@nexgapp.com'));

insert into t (k, v) select 'merchant',
  (select id::text from public.merchant where city_id = (select v::uuid from t where k='city') limit 1);
insert into t (k, v) select 'branch',
  (select id::text from public.merchant_branch
    where merchant_id = (select v::uuid from t where k='merchant') limit 1);

insert into public.guest (id, phone, name)
values ('aa000000-0000-4000-8000-000000000001', '+254700000921', '[Guest]')
on conflict (id) do nothing;

insert into public.order
  (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
   dropoff_label, stage, payment_method, payment_status,
   subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('ab000000-0000-4000-8000-000000000001','PAY-TEST-1','aa000000-0000-4000-8000-000000000001',
   (select v::uuid from t where k='merchant'), (select v::uuid from t where k='branch'),
   (select v::uuid from t where k='city'), 'web', '[Somewhere]',
   'confirmed','card','pending', 100000, 25000, 5000, 130000, 'KES')
on conflict (id) do nothing;

-- ════════════════════════════ 1. opening a checkout

select is(
  (public.rpc_payment_begin_order('ab000000-0000-4000-8000-000000000001') ->> 'ok')::boolean,
  true,
  'A card order can open a checkout.');

insert into t (k, v) select 'ref',
  (select reference from public.payment where order_id = 'ab000000-0000-4000-8000-000000000001');

select is(
  (select amount_cents from public.payment where reference = (select v from t where k='ref')),
  130000::bigint,
  'For the whole of what is owed, taken from the order rather than the caller.');

select is(
  (select state::text from public.payment where reference = (select v from t where k='ref')),
  'pending',
  'And it starts pending — the row exists before the provider has heard of it.');

/*
 * The second one is the dangerous one. Two open checkouts on an
 * order is a guest paying twice.
 */
select is(
  (public.rpc_payment_begin_order('ab000000-0000-4000-8000-000000000001') ->> 'reused')::boolean,
  true,
  'Asking again hands back the same checkout rather than opening a second.');

select is(
  (select count(*)::int from public.payment
    where order_id = 'ab000000-0000-4000-8000-000000000001'),
  1,
  'So there is exactly one.');

-- ════════════════════ 2. the provider says it was paid

select is(
  (public.rpc_payment_webhook(
    'charge.success', (select v from t where k='ref'), 'digest-one', true,
    '{"event":"charge.success"}'::jsonb, true, 'ps-1', 130000, 'card') ->> 'ok')::boolean,
  true,
  'A signed success moves the payment.');

select is(
  (select state::text from public.payment where reference = (select v from t where k='ref')),
  'paid',
  'The payment is paid.');

select is(
  (select payment_status::text from public.order where id = 'ab000000-0000-4000-8000-000000000001'),
  'paid',
  'And so is the order — which is the whole point of the webhook.');

select is(
  (select count(*)::int from public.order_event
    where order_id = 'ab000000-0000-4000-8000-000000000001' and kind = 'paid'),
  1,
  'The timeline says so once.');

-- ══════════════════════════════ 3. the same one again

select is(
  (public.rpc_payment_webhook(
    'charge.success', (select v from t where k='ref'), 'digest-one', true,
    '{"event":"charge.success"}'::jsonb, true, 'ps-1', 130000, 'card') ->> 'duplicate')::boolean,
  true,
  'The same delivery again is recognised and does nothing.');

select is(
  (select count(*)::int from public.order_event
    where order_id = 'ab000000-0000-4000-8000-000000000001' and kind = 'paid'),
  1,
  'Still once. Paystack retries, and a retry that charged twice is the worst bug here.');

select is(
  (select count(*)::int from public.payment_event
    where reference = (select v from t where k='ref')),
  1,
  'And only one event was stored, because the digest is the same.');

-- ════════════════════════ 4. a forged one changes nothing

insert into public.order
  (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
   dropoff_label, stage, payment_method, payment_status,
   subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('ab000000-0000-4000-8000-000000000002','PAY-TEST-2','aa000000-0000-4000-8000-000000000001',
   (select v::uuid from t where k='merchant'), (select v::uuid from t where k='branch'),
   (select v::uuid from t where k='city'), 'web', '[Somewhere]',
   'confirmed','card','pending', 60000, 25000, 3000, 88000, 'KES')
on conflict (id) do nothing;

select public.rpc_payment_begin_order('ab000000-0000-4000-8000-000000000002');
insert into t (k, v) select 'ref2',
  (select reference from public.payment where order_id = 'ab000000-0000-4000-8000-000000000002');

select is(
  (public.rpc_payment_webhook(
    'charge.success', (select v from t where k='ref2'), 'digest-forged', false,
    '{"event":"charge.success"}'::jsonb, true, 'ps-x', 88000, 'card') ->> 'reason'),
  'bad_signature',
  'An unsigned webhook is refused.');

select is(
  (select payment_status::text from public.order where id = 'ab000000-0000-4000-8000-000000000002'),
  'pending',
  'And the order has not moved.');

select is(
  (select count(*)::int from public.payment_event where dedupe_key = 'digest-forged'),
  1,
  'But the attempt is kept — a run of these is somebody probing, and that is worth seeing.');

select is(
  (select signature_ok from public.payment_event where dedupe_key = 'digest-forged'),
  false,
  'Recorded as what it was.');

-- ═══════════════ 5. a different amount from the one asked for

select is(
  (public.rpc_payment_webhook(
    'charge.success', (select v from t where k='ref2'), 'digest-short', true,
    '{"event":"charge.success"}'::jsonb, true, 'ps-2', 100, 'card') ->> 'reason'),
  'amount_mismatch',
  'A provider settling one shilling against an 880 shilling order is refused.');

select is(
  (select payment_status::text from public.order where id = 'ab000000-0000-4000-8000-000000000002'),
  'pending',
  'The order stays unpaid.');

select is(
  (select state::text from public.payment where reference = (select v from t where k='ref2')),
  'failed',
  'And the payment is failed rather than quietly left open.');

select is(
  (select count(*)::int from audit.audit_event where action = 'payment.amount_mismatch'),
  1,
  'Somebody is told, at high severity — this is the most expensive thing to wave through.');

-- ════════════════════════ 6. a refund that has not moved

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

reset role;
update settings.version set status = 'superseded', superseded_at = now()
 where status = 'active' and key = 'finance.refund_two_person_threshold'
   and scope_city_id = (select v::uuid from t where k='city');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (public.rpc_order_refund('ab000000-0000-4000-8000-000000000001', 10000,
     'original', 'late', 'arrived cold') ->> 'needs_second_person')::boolean,
  false,
  'A refund under any threshold is approved on the spot.');

insert into t (k, v) select 'refund',
  (select id::text from public.refund where order_id = 'ab000000-0000-4000-8000-000000000001' limit 1);

select is(
  (select status from public.refund where id = (select v::uuid from t where k='refund')),
  'approved',
  'Approved is not issued. Nothing has left the account.');

select is(
  (select count(*)::int from public.refunds_to_issue_v
    where refund_id = (select v::uuid from t where k='refund')),
  1,
  'So it sits in the queue of refunds waiting on a provider.');

select is(
  (select original_provider_ref from public.refunds_to_issue_v
    where refund_id = (select v::uuid from t where k='refund')),
  'ps-1',
  'Carrying the transaction it has to be refunded against.');

select is(
  (public.rpc_refund_issued((select v::uuid from t where k='refund'), 'ps-refund-1') ->> 'ok')::boolean,
  true,
  'Once the provider has carried it out, it can be marked issued.');

select is(
  (select payment_status::text from public.order where id = 'ab000000-0000-4000-8000-000000000001'),
  'partially_refunded',
  'And the order says partially refunded, because 100 of 1,300 went back.');

select is(
  (public.rpc_refund_issued((select v::uuid from t where k='refund'), 'ps-refund-1') ->> 'duplicate')::boolean,
  true,
  'Marking it twice does nothing.');

-- ═══════════════════ 7. what the realtime screens depend on

reset role;
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname || '.' || tablename in
        ('public.order', 'public.order_event', 'public.live_pulse')),
  3,
  'The three tables a live screen watches are published.');

/*
 * Realtime only serves `public`. A subscription to a dispatch
 * table is refused — and because the console asked for several in
 * one channel, losing one lost them all and the screen sat on
 * "reconnecting" looking otherwise fine. Dispatch rings a bell in
 * `public` instead, and these two assertions are what stop
 * somebody putting it back.
 */
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'dispatch'),
  0,
  'No dispatch table is published, because Realtime cannot serve that schema.');

select ok(
  (select count(*) from pg_trigger
    where tgname in ('job_rings_the_bell', 'offer_rings_the_bell',
                     'zone_health_rings_the_bell')
      and not tgisinternal) = 3,
  'All three dispatch tables ring the bell instead.');

select is(
  (select count(*)::int from public.live_pulse),
  (select count(*)::int from public.city),
  'And every city has a bell to ring, so the first change updates rather than races to insert.');

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname || '.' || tablename = 'public.rider'),
  0,
  'And the rider table is not — a publication puts whole rows on the wire, and that one is every rider''s live position.');

select is(
  (select relreplident::text from pg_class where oid = 'dispatch.offer'::regclass),
  'f',
  'Offers carry the old row on an update, so a row that stops matching does not freeze on screen.');

select is(
  (select count(*)::int from public.console_zone_shape_v where shape is not null),
  (select count(*)::int from public.zone where polygon is not null),
  'Every drawn zone has geometry the map can render.');

select * from finish();
rollback;
