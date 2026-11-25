-- Cinema seats paid through Paystack (20270320000200): the customer opens a
-- payment for their own paying hold, a test-key try at the test cinema,
-- Paystack's signed success moves the hold on to confirming (once), and a hold
-- the cinema could not book is refunded in full, marked refunded only when
-- Paystack says the refund is processed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key',
                                         'cinema_worker_url', 'cinema_worker_secret');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_test_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'card', 'fees', 1950,
      'gateway_response', 'Approved'))::text
$$;
create function pg_temp.refund_event(p_reference text, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'refund.processed',
    'data', jsonb_build_object('id', 923299, 'refund_reference', p_reference, 'amount', p_amount,
      'currency', 'KES', 'status', 'processed'))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
/* The error's SQLSTATE and hint, or 'done'. */
create function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
declare
  v_state text;
  v_hint text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || ':' || coalesce(v_hint, '');
end
$$;
/* What a repeat webhook must not change: the hold's state and settle time, and
   the audit trail of the hold and its payment. Read as the setup role. */
create function pg_temp.snap(p_hold uuid) returns text language sql as $$
  select h.state || '|' || coalesce(h.settled_at::text, '-') || '|'
         || (select count(*) from audit.audit_event e
              where e.target_id = h.id
                 or e.target_id in (select py.id from public.payment py where py.cinema_hold_id = h.id))::text
    from cinema.hold h where h.id = p_hold
$$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'filmgoer232@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'stranger232@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'filmgoer232b@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'filmgoer232c@example.test', now(), false, now(), now());

-- The test cinema: a test tenant, so it takes Paystack test keys.
insert into public.merchant (id, legal_name, trading_name, category, subcategory, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, accepts_test_payments)
select 'c2320000-0000-4000-8000-00000000000a', '[Legal 232] Ltd', '[Test Cinema 232]', 'experiences', 'cinemas',
       '[Contact]', '+254700023200', 'cinema232@example.test', c.id, 'live', true, true,
       now() - interval '30 days', true
from public.city c where c.slug = 'nairobi';

insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c2320000-0000-4000-8000-0000000000c1', 'sandbox-cinema', 'c2320000-0000-4000-8000-00000000000a',
        'sandbox', 'operational');

create function pg_temp.showing(p_ref text, p_hours numeric) returns jsonb language sql as $f$
  select jsonb_build_object('ref', p_ref, 'filmRef', 'F1', 'screenRef', 'S1',
    'startsAt', now() + interval '1 day' + make_interval(secs => p_hours * 3600),
    'endsAt', now() + interval '1 day' + make_interval(secs => (p_hours + 2) * 3600),
    'format', '2D', 'status', 'on_sale',
    'prices', jsonb_build_object('standardMinor', 65000))
$f$;
create function pg_temp.showing_id(p_ref text) returns uuid language sql as $f$
  select id from cinema.showing where connection_id = 'c2320000-0000-4000-8000-0000000000c1' and source_ref = p_ref
$f$;

select public.cinema_sync_apply('c2320000-0000-4000-8000-0000000000c1', jsonb_build_object(
  'window', jsonb_build_object('from', now(), 'to', now() + interval '7 days'),
  'films', jsonb_build_array(jsonb_build_object('ref', 'F1', 'title', 'The Short Rains 232', 'runtimeMinutes', 110,
    'releaseDate', '2026-10-01', 'classification', 'PG')),
  'screens', jsonb_build_array(jsonb_build_object('ref', 'S1', 'name', 'Screen 1', 'layoutVersion', 'v1',
    'rows', jsonb_build_array(jsonb_build_object('label', 'A', 'position', 1, 'seats', jsonb_build_array(
      jsonb_build_object('code', 'A1', 'column', 1, 'number', 1, 'type', 'standard'),
      jsonb_build_object('code', 'A2', 'column', 2, 'number', 2, 'type', 'standard')))))),
  'showings', jsonb_build_array(pg_temp.showing('SH1', 0), pg_temp.showing('SH2', 3), pg_temp.showing('SH3', 6),
    pg_temp.showing('SH4', 9), pg_temp.showing('SH5', 12), pg_temp.showing('SH6', 15))));

-- H1: two standard seats (2 x 65000), paying. H2: held, not paying. H3: paying, 30 seconds left.
insert into t select 'h1', public.cinema_record_hold(pg_temp.showing_id('SH1'), 'c2320000-0000-4000-8000-000000000001',
  'c2320000-0000-4000-8000-0000000000d1', array['A1', 'A2'],
  '[{"seat": "A1", "priceMinor": 65000}, {"seat": "A2", "priceMinor": 65000}]'::jsonb,
  130000, 'SBX-232-1', now() + interval '7 minutes') ->> 'holdId';
select public.cinema_record_paying((select v::uuid from t where k = 'h1'), now() + interval '15 minutes');
insert into t select 'h2', public.cinema_record_hold(pg_temp.showing_id('SH2'), 'c2320000-0000-4000-8000-000000000001',
  'c2320000-0000-4000-8000-0000000000d2', array['A1'], '[{"seat": "A1", "priceMinor": 65000}]'::jsonb,
  65000, 'SBX-232-2', now() + interval '7 minutes') ->> 'holdId';
insert into t select 'h3', public.cinema_record_hold(pg_temp.showing_id('SH3'), 'c2320000-0000-4000-8000-000000000001',
  'c2320000-0000-4000-8000-0000000000d3', array['A1'], '[{"seat": "A1", "priceMinor": 65000}]'::jsonb,
  65000, 'SBX-232-3', now() + interval '7 minutes') ->> 'holdId';
select public.cinema_record_paying((select v::uuid from t where k = 'h3'), now() + interval '30 seconds');

-- H4..H6 (the second filmgoer, three showings at most) and H7, H8 (the third):
-- one standard seat each (65000), all paying.
create function pg_temp.paying_hold(p_key text, p_showing text, p_user text, p_request text, p_seat text)
returns void language plpgsql as $f$
begin
  insert into t select p_key, public.cinema_record_hold(pg_temp.showing_id(p_showing), p_user::uuid,
    p_request::uuid, array[p_seat], jsonb_build_array(jsonb_build_object('seat', p_seat, 'priceMinor', 65000)),
    65000, 'SBX-232-' || p_key, now() + interval '7 minutes') ->> 'holdId';
  perform public.cinema_record_paying((select v::uuid from t where k = p_key), now() + interval '15 minutes');
end
$f$;
select pg_temp.paying_hold('h4', 'SH2', 'c2320000-0000-4000-8000-000000000003', 'c2320000-0000-4000-8000-0000000000d4', 'A2');
select pg_temp.paying_hold('h5', 'SH3', 'c2320000-0000-4000-8000-000000000003', 'c2320000-0000-4000-8000-0000000000d5', 'A2');
select pg_temp.paying_hold('h6', 'SH4', 'c2320000-0000-4000-8000-000000000003', 'c2320000-0000-4000-8000-0000000000d6', 'A1');
select pg_temp.paying_hold('h7', 'SH5', 'c2320000-0000-4000-8000-000000000004', 'c2320000-0000-4000-8000-0000000000d7', 'A1');
select pg_temp.paying_hold('h8', 'SH6', 'c2320000-0000-4000-8000-000000000004', 'c2320000-0000-4000-8000-0000000000d8', 'A1');

-- ─────────────────────────────────────────────────────── opening the payment

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000002');
select is(pg_temp.err_of(format($$select public.rpc_payment_begin_cinema(%L)$$, (select v from t where k = 'h1'))),
  '42501:', 'Nobody pays for another customer''s hold.');

select pg_temp.as_user('c2320000-0000-4000-8000-000000000001');
select is(pg_temp.err_of(format($$select public.rpc_payment_begin_cinema(%L)$$, (select v from t where k = 'h2'))),
  '22023:hold_not_paying', 'A hold the worker has not moved to paying cannot be paid yet.');
select is(pg_temp.err_of(format($$select public.rpc_payment_begin_cinema(%L)$$, (select v from t where k = 'h3'))),
  '22023:hold_too_short', 'A hold with 30 seconds left is not paid: too little time.');

insert into t select 'ref1', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h1')) ->> 'reference';
insert into t select 'again', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h1'))::text;
reset role;

select is((select amount_cents || ':' || intent::text || ':' || merchant_id::text || ':' || created_via
             from public.payment where cinema_hold_id = (select v::uuid from t where k = 'h1')),
  '130000:cinema:c2320000-0000-4000-8000-00000000000a:guest_checkout',
  'The payment is the hold''s total (two seats at KES 650), for the cinema''s merchant.');
select is((select (v::jsonb ->> 'reused') || ':'
                  || ((v::jsonb ->> 'reference') = (select py.reference from public.payment py
                                                     where py.cinema_hold_id = (select v::uuid from t where k = 'h1')))::text
                  || ':' || (select count(*) from public.payment py
                              where py.cinema_hold_id = (select v::uuid from t where k = 'h1'))::text
             from t where k = 'again'),
  'true:true:1', 'Asking again hands back the same payment.');

-- ─────────────────────────────────────────────────────── a test-key try at the test cinema

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000001');
insert into t select 'try1', public.rpc_payment_paystack_attempt((select v from t where k = 'ref1'), 'card', null,
  'sk_test_ci_only_0123456789abcdef')::text;
reset role;
/* By hand: 2 standard seats x 65000 cents = 130000; no split, all of it to NexG. */
select is((select (v::jsonb ->> 'amount_cents') || ':' || (v::jsonb ->> 'is_test') || ':' || (v::jsonb ? 'split')::text
             from t where k = 'try1'),
  '130000:true:false', 'A test-key try at the test cinema asks Paystack for KES 1,300, with no split.');

-- ─────────────────────────────────────────────────────── Paystack's signed success

insert into t select 'paid1', pg_temp.ps_paid((select v::jsonb ->> 'attempt_reference' from t where k = 'try1'),
  923201, 130000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'paid1'),
  pg_temp.ps_sign((select v from t where k = 'paid1'))) ->> 'state', 'paid', 'Paystack''s signed success is taken.');
reset role;

select is((select state::text || ':' || provider_ref from public.payment
            where cinema_hold_id = (select v::uuid from t where k = 'h1')),
  'paid:923201', 'The payment is paid, with Paystack''s transaction.');
select is((select h.state || ':' || (h.payment_reference = py.reference)::text || ':' || (h.settled_at is not null)::text
             from cinema.hold h join public.payment py on py.cinema_hold_id = h.id
            where h.id = (select v::uuid from t where k = 'h1')),
  'confirming:true:true', 'And the hold moves on to confirming with the cinema, under that payment.');

insert into t select 'snap', pg_temp.snap((select v::uuid from t where k = 'h1'));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid1'),
  pg_temp.ps_sign((select v from t where k = 'paid1')));
reset role;
select is(pg_temp.snap((select v::uuid from t where k = 'h1')), (select v from t where k = 'snap'),
  'A repeat of the same webhook changes nothing: state, settle time and audit trail.');

-- ─────────────────────────────────────────────────────── the cinema refuses: a full refund

select public.cinema_record_confirm_failed((select v::uuid from t where k = 'h1'), 'seat_lost', true);
select ok((public.cron_cinema_worker() ->> 'refunds_to_start')::int >= 1,
  'A refund not yet started wakes the cinema worker.');

insert into t select 'rf1', public.fn_cinema_refund_open((select v::uuid from t where k = 'h1'), 'confirm_refused')::text;
select is((select (v::jsonb ->> 'amount_cents') || ':' || (v::jsonb ->> 'mode') || ':'
                  || (v::jsonb ->> 'paystack_transaction') || ':' || (v::jsonb ->> 'state')
             from t where k = 'rf1'),
  '130000:test:923201:opened', 'The refund is the whole KES 1,300, in test mode, against Paystack''s transaction.');
select is((select ((public.fn_cinema_refund_open((select v::uuid from t where k = 'h1'), 'confirm_refused') ->> 'reference')
                   = (select r.reference from public.paystack_refund r join public.payment py on py.id = r.payment_id
                       where py.cinema_hold_id = (select v::uuid from t where k = 'h1')))::text
                  || ':' || (select count(*) from public.paystack_refund r join public.payment py on py.id = r.payment_id
                              where py.cinema_hold_id = (select v::uuid from t where k = 'h1'))::text),
  'true:1', 'Asking again answers the same refund; nothing is refunded twice.');

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000001');
select is(pg_temp.err_of(format($$select public.fn_cinema_refund_open(%L, 'mine')$$, (select v from t where k = 'h1'))),
  '42501:', 'A customer cannot open a refund.');
reset role;

select is(public.fn_paystack_refund_answered_system(
    (select r.reference from public.paystack_refund r join public.payment py on py.id = r.payment_id
      where py.cinema_hold_id = (select v::uuid from t where k = 'h1')),
    '{"status": true, "message": "Refund has been queued for processing", "data": {"id": 923299, "status": "pending", "amount": 130000}}'::jsonb)
  ->> 'state', 'pending', 'Paystack''s first answer is recorded; the hold is not refunded yet.');

insert into t select 'rp1', pg_temp.refund_event(
  (select r.reference from public.paystack_refund r join public.payment py on py.id = r.payment_id
    where py.cinema_hold_id = (select v::uuid from t where k = 'h1')), 130000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'rp1'),
  pg_temp.ps_sign((select v from t where k = 'rp1')));
reset role;
select is((select h.state || ':' || (h.refund_reference = r.reference)::text || ':' || py.state::text
             from cinema.hold h
             join public.payment py on py.cinema_hold_id = h.id
             join public.paystack_refund r on r.payment_id = py.id
            where h.id = (select v::uuid from t where k = 'h1')),
  'refunded:true:reversed', 'Paystack''s processed refund marks the hold refunded and the payment reversed.');

-- ─────────────────────────────────────────────────────── a hold that ends

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000003');
insert into t select 'ref4', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h4')) ->> 'reference';
insert into t select 'ref5', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h5')) ->> 'reference';
reset role;

/* H4 released while its payment is still open: the closing trigger is held
   off here (as the setup role, inside this test's transaction) so the try
   itself is what refuses. */
alter table cinema.hold disable trigger cinema_hold_payment_closed;
update cinema.hold set state = 'released', updated_at = now() where id = (select v::uuid from t where k = 'h4');
alter table cinema.hold enable trigger cinema_hold_payment_closed;

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000003');
select is(pg_temp.err_of(format($$select public.rpc_payment_paystack_attempt(%L, 'card', null, 'sk_test_ci_only_0123456789abcdef')$$,
                                (select v from t where k = 'ref4'))),
  '22023:hold_not_paying', 'A released hold''s payment is not tried at Paystack.');
reset role;

select public.cinema_record_hold_ended((select v::uuid from t where k = 'h5'), 'released');
select is((select state::text || ':' || failure_reason from public.payment where reference = (select v from t where k = 'ref5')),
  'abandoned:The seat hold was released before it was paid.',
  'A hold released before it is paid closes its open payment.');

-- ─────────────────────────────────────────────────────── a live payment is not refunded automatically

/* A live Paystack payment for H6, built as the setup role. It names no
   merchant: the test cinema takes test payments only (payment_test_tenant_guard). */
insert into public.payment (reference, intent, cinema_hold_id, city_id, amount_cents, currency, created_by,
                            created_via, expires_at, provider, is_test, provider_ref)
select public.fn_payment_reference(), 'cinema', (select v::uuid from t where k = 'h6'), c.id, 65000, 'KES',
       'c2320000-0000-4000-8000-000000000003', 'guest_checkout', now() + interval '15 minutes', 'paystack', false,
       '923601'
  from public.city c where c.slug = 'nairobi';
update public.payment set state = 'paid', paid_at = now(), updated_at = now()
 where cinema_hold_id = (select v::uuid from t where k = 'h6');
select public.cinema_record_confirm_failed((select v::uuid from t where k = 'h6'), 'seat_lost', true);
select is(pg_temp.err_of(format($$select public.fn_cinema_refund_open(%L, 'confirm_refused')$$, (select v from t where k = 'h6'))),
  '22023:live_refunds_off', 'A live payment''s refund is refused while live cinema refunds are off (the default).');

-- ─────────────────────────────────────────────────────── refunded, but the cinema booked meanwhile

set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000004');
insert into t select 'ref7', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h7')) ->> 'reference';
insert into t select 'try7', public.rpc_payment_paystack_attempt((select v from t where k = 'ref7'), 'card', null,
  'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference';
insert into t select 'ref8', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h8')) ->> 'reference';
insert into t select 'try8', public.rpc_payment_paystack_attempt((select v from t where k = 'ref8'), 'card', null,
  'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference';
reset role;

insert into t select 'paid7', pg_temp.ps_paid((select v from t where k = 'try7'), 923701, 65000);
insert into t select 'paid8', pg_temp.ps_paid((select v from t where k = 'try8'), 923801, 65000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid7'), pg_temp.ps_sign((select v from t where k = 'paid7')));
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid8'), pg_temp.ps_sign((select v from t where k = 'paid8')));
reset role;
select public.cinema_record_confirm_failed((select v::uuid from t where k = 'h7'), 'seat_lost', true);
select public.cinema_record_confirm_failed((select v::uuid from t where k = 'h8'), 'seat_lost', true);

insert into t select 'rf7', public.fn_cinema_refund_open((select v::uuid from t where k = 'h7'), 'confirm_refused') ->> 'reference';
-- The cinema books the seats after all, before Paystack has processed the refund.
select public.cinema_record_confirm((select v::uuid from t where k = 'h7'), 'SBX-BOOK-232-7', '[]'::jsonb);
insert into t select 'rp7', pg_temp.refund_event((select v from t where k = 'rf7'), 65000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t select 'rp7_err', pg_temp.err_of(format($$select public.rpc_payment_paystack_webhook(%L, %L)$$,
  (select v from t where k = 'rp7'), pg_temp.ps_sign((select v from t where k = 'rp7'))));
reset role;
select is((select v from t where k = 'rp7_err'),
  'done', 'Paystack''s processed refund for a hold the cinema booked meanwhile is taken without an error.');
select is((select h.state || ':' || py.state::text || ':'
                  || (select count(*) from audit.audit_event e
                       where e.action = 'cinema.refunded_but_booked' and e.target_id = h.id)::text
             from cinema.hold h join public.payment py on py.cinema_hold_id = h.id
            where h.id = (select v::uuid from t where k = 'h7')),
  'confirmed:reversed:1', 'The booking stands, the payment is reversed, and a person is told.');

-- ─────────────────────────────────────────────────────── Paystack refuses the refund

insert into t select 'rf8', public.fn_cinema_refund_open((select v::uuid from t where k = 'h8'), 'confirm_refused') ->> 'reference';
select public.fn_paystack_refund_answered_system((select v from t where k = 'rf8'),
  '{"status": false, "message": "Transaction has been fully reversed"}'::jsonb);
select is((select r.state || ':' || r.failure_reason || ':'
                  || (select count(*) from audit.audit_event e
                       where e.action = 'payment.paystack_refund_failed' and e.target_id = r.payment_id)::text
             from public.paystack_refund r where r.reference = (select v from t where k = 'rf8')),
  'failed:Transaction has been fully reversed:1', 'A refused refund is marked failed, and a person is told.');
select is((select (public.fn_cinema_refund_open((select v::uuid from t where k = 'h8'), 'confirm_refused') ->> 'state')
                  || ':' || (select count(*) from public.paystack_refund r join public.payment py on py.id = r.payment_id
                              where py.cinema_hold_id = (select v::uuid from t where k = 'h8'))::text),
  'failed:1', 'Asking again hands back the failed refund; nothing new is sent to Paystack.');
select is(coalesce(public.cron_cinema_worker() ->> 'refunds_to_start', '0'), '0',
  'Neither a failed refund nor a live one (live refunds off) wakes the cinema worker.');

/* H9 (the stranger, one seat, 65000): paid in test mode, then refused by the
   cinema, so its refund is due and not yet started. */
select pg_temp.paying_hold('h9', 'SH5', 'c2320000-0000-4000-8000-000000000002', 'c2320000-0000-4000-8000-0000000000d9', 'A2');
set local role authenticated;
select pg_temp.as_user('c2320000-0000-4000-8000-000000000002');
insert into t select 'ref9', public.rpc_payment_begin_cinema((select v::uuid from t where k = 'h9')) ->> 'reference';
insert into t select 'try9', public.rpc_payment_paystack_attempt((select v from t where k = 'ref9'), 'card', null,
  'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference';
reset role;
insert into t select 'paid9', pg_temp.ps_paid((select v from t where k = 'try9'), 923901, 65000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid9'), pg_temp.ps_sign((select v from t where k = 'paid9')));
reset role;
select public.cinema_record_confirm_failed((select v::uuid from t where k = 'h9'), 'seat_lost', true);
insert into t select 'due', (public.cinema_due_work(50) -> 'refunds')::text;
select is((select ((v::jsonb ? (select v from t where k = 'h9')))::text || ':'
                  || ((v::jsonb ? (select v from t where k = 'h8')))::text || ':'
                  || ((v::jsonb ? (select v from t where k = 'h6')))::text
             from t where k = 'due'),
  'true:false:false', 'The worker''s refund list has a fresh refund due, not a failed one or a live one.');

-- ─────────────────────────────────────────────────────── the wiring

select is((select count(*)::int from public.fn_wiring_check()
            where finding ~ '(rpc_payment_begin_cinema|rpc_cinema_payment_state|fn_cinema_refund_open|fn_paystack_refund_answered_system|tg_payment_cinema_settled|tg_cinema_hold_payment_closed|cron_cinema_worker)'),
  0, 'The wiring check finds nothing in the new functions.');

select * from finish();
rollback;
