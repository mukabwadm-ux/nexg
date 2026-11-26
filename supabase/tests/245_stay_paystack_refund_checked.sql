-- What the Paystack dashboard shows, recorded by staff (20270328000100): a
-- refund marked processed refunds the stay under NexG's own reference and
-- credits a split host back; marked failed it refunds nothing and can be sent
-- again; a repeat changes nothing, and neither does an answer about a try that
-- has since been replaced. While Paystack may still send a refund it cannot be
-- recorded another way; sent by hand, its receipt never says the card; and a
-- processed refund for a stay already recorded refunded another way is audited
-- as a possible double payment, naming a split host.
--
-- Money by hand: KES 7,000 a night, so two nights are KES 14,000 (1,400,000
-- cents). Stay 1 is split to the host at 15% commission: KES 2,100 to NexG and
-- KES 11,900 (1,190,000 cents) to the host. Stay 3 is cancelled under a policy
-- that gives half back: KES 7,000 (700,000 cents).

begin;
create extension if not exists pgtap with schema extensions;
select plan(48);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.ps_sign(p_body text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'),
    convert_to('sk_live_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.send(p_body text) returns jsonb
language sql as $$
  select public.rpc_payment_paystack_webhook(p_body, pg_temp.ps_sign(p_body))
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_channel text, p_subaccount text) returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', 1400000, 'currency', 'KES', 'channel', p_channel, 'fees', 4350,
      'gateway_response', 'Approved',
      'subaccount', case when p_subaccount is null then '{}'::jsonb
                         else jsonb_build_object('subaccount_code', p_subaccount) end))::text
$$;
/* Paystack's documented refund.processed: no id, no reference of ours unless
   given, the amount a string. */
create function pg_temp.processed(p_transaction text, p_refund_reference text, p_amount text) returns text
language sql as $$
  select jsonb_build_object('event', 'refund.processed',
    'data', jsonb_build_object('status', 'processed', 'transaction_reference', p_transaction,
      'refund_reference', p_refund_reference, 'amount', p_amount, 'currency', 'KES',
      'processor', 'mpgs_zen', 'integration', 412829, 'domain', 'live'))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.id_of(p_key text) returns uuid language sql as $$
  select v::uuid from t where k = p_key
$$;
/* A stay's refund: Paystack's side (a live row first), the stay's side and the payment. */
create function pg_temp.refund_of(p_stay uuid) returns text language sql as $$
  select coalesce((select r.state from public.paystack_refund r
                    where r.kind = 'stay' and r.stay_id = s.id
                    order by (r.state = 'failed') limit 1), '-')
         || ':' || (s.refunded_at is not null)::text || ':' || p.state::text
    from public.stay s join public.payment p on p.reference = s.payment_reference
   where s.id = p_stay
$$;
/* What a repeat must not change: the stay and its refund rows (ctid moves on any
   update) and the audit entries about the stay. Read as the setup role. */
create function pg_temp.snap(p_stay uuid) returns text language sql as $$
  select s.ctid::text || '|' || s.updated_at::text || '|'
         || (select count(*) from audit.audit_event e where e.target_id = s.id)::text || '|'
         || coalesce((select string_agg(r.ctid::text || r.state, ' ' order by r.reference)
                        from public.paystack_refund r where r.stay_id = s.id), '-')
    from public.stay s where s.id = p_stay
$$;
/* Ledger transactions of one kind about one stay. */
create function pg_temp.posted(p_stay uuid, p_kind text) returns integer language sql as $$
  select count(*)::int from ledger.transaction x
   where x.kind = p_kind and x.related ->> 'stay_id' = p_stay::text
$$;
create function pg_temp.doubles(p_stay uuid) returns integer language sql as $$
  select count(*)::int from audit.audit_event e
   where e.action = 'stay.refund_possible_double' and e.target_id = p_stay
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd2450000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'guest245a@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2450000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'guest245b@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2450000-0000-4000-8000-000000000031', 'authenticated',
   'authenticated', 'host245@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2450000-0000-4000-8000-0000000000aa', 'authenticated',
   'authenticated', 'partners245@test.local', '', now(), false, now(), now());
insert into public.staff_user (id, user_id, email, display_name)
values ('d2450000-0000-4000-8000-0000000000b1', 'd2450000-0000-4000-8000-0000000000aa',
        'partners245@test.local', 'Partnerships 245');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
values ('d2450000-0000-4000-8000-0000000000b1', (select id from public.role where key = 'partnerships'),
        (select id from public.city where slug = 'nairobi'), 'd2450000-0000-4000-8000-0000000000b1');

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d2451000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 245]', '+254700024500',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.host_user (host_id, user_id, role, units)
values ('d2451000-0000-4000-8000-00000000000a', 'd2450000-0000-4000-8000-000000000031', 'owner', null);
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, cancellation_terms)
values ('d2452000-0000-4000-8000-00000000000a', 'd2451000-0000-4000-8000-00000000000a', 'block-245', '[Block 245]',
        'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'), true, now(),
        public.fn_cancellation_policy('{"preset":"custom","tiers":[{"days_before":0,"refund_pct":50}]}'));
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d2453000-0000-4000-8000-00000000000a', 'd2451000-0000-4000-8000-00000000000a',
        'd2452000-0000-4000-8000-00000000000a', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000);

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-000000000001');
insert into t select 'stay1', public.rpc_stay_hold('d2453000-0000-4000-8000-00000000000a',
  current_date + 30, current_date + 32, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'stay2', public.rpc_stay_hold('d2453000-0000-4000-8000-00000000000a',
  current_date + 40, current_date + 42, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'pay1', public.rpc_payment_begin_stay(pg_temp.id_of('stay1')) ->> 'reference';
insert into t select 'pay2', public.rpc_payment_begin_stay(pg_temp.id_of('stay2')) ->> 'reference';
select public.rpc_payment_paystack_attempt((select v from t where k = 'pay1'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'pay1') || '-1', 'acc_ci245a',
  'https://checkout.paystack.com/ci-245a', null, 'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_attempt((select v from t where k = 'pay2'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'pay2') || '-1', 'acc_ci245b',
  'https://checkout.paystack.com/ci-245b', null, 'sk_live_ci_only_0123456789abcdef');
select pg_temp.as_user('d2450000-0000-4000-8000-000000000002');
insert into t select 'stay3', public.rpc_stay_hold('d2453000-0000-4000-8000-00000000000a',
  current_date + 50, current_date + 52, '{"first_name":"Brian"}'::jsonb) ->> 'stay_id';
insert into t select 'stay4', public.rpc_stay_hold('d2453000-0000-4000-8000-00000000000a',
  current_date + 60, current_date + 62, '{"first_name":"Brian"}'::jsonb) ->> 'stay_id';
insert into t select 'pay3', public.rpc_payment_begin_stay(pg_temp.id_of('stay3')) ->> 'reference';
insert into t select 'pay4', public.rpc_payment_begin_stay(pg_temp.id_of('stay4')) ->> 'reference';
select public.rpc_payment_paystack_attempt((select v from t where k = 'pay3'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'pay3') || '-1', 'acc_ci245c',
  'https://checkout.paystack.com/ci-245c', null, 'sk_live_ci_only_0123456789abcdef');
reset role;

-- Stay 1's try is split to the host, as checkout writes it for a host with a sub-account.
update public.paystack_attempt
   set split_host_id = 'd2451000-0000-4000-8000-00000000000a', split_subaccount = 'ACCT_ci2450001',
       split_share_cents = 1190000, split_commission_pct = 15
 where reference = (select v from t where k = 'pay1') || '-1';
insert into t select 'txn1', (select v from t where k = 'pay1') || '-1';
insert into t select 'txn3', (select v from t where k = 'pay3') || '-1';
insert into t select 'paid1', pg_temp.ps_paid((select v from t where k = 'txn1'), 2450001, 'card', 'ACCT_ci2450001');
insert into t select 'paid2', pg_temp.ps_paid((select v from t where k = 'pay2') || '-1', 2450002, 'mobile_money', null);
insert into t select 'paid3', pg_temp.ps_paid((select v from t where k = 'txn3'), 2450003, 'card', null);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.send((select v from t where k = 'paid1'));
select pg_temp.send((select v from t where k = 'paid2'));
select pg_temp.send((select v from t where k = 'paid3'));
reset role;
-- Stay 4 was not paid through Paystack.
select public.rpc_payment_webhook(
  p_event => 'test.settled', p_reference => (select v from t where k = 'pay4'),
  p_dedupe_key => 'test:245', p_signature_ok => true, p_payload => '{}'::jsonb, p_paid => true,
  p_provider_ref => 'TEST-245', p_amount_cents => 1400000, p_channel => 'mpesa');

select is(
  (select count(*) || ' ' || (select concat_ws(':', host_share_kes, commission_kes) from public.stay
                               where id = pg_temp.id_of('stay1'))
     from public.stay
    where host_id = 'd2451000-0000-4000-8000-00000000000a' and status = 'booked'),
  '4 11900:2100', 'Fixtures: four paid stays, the first at the host''s share of KES 11,900.');
select is(pg_temp.posted(pg_temp.id_of('stay1'), 'host_paid_by_paystack'), 1,
  'and the books record that Paystack paid that host.');

-- ──────────────────────────────────────────────────── 1. who may, and what is asked

select ok(
  not has_function_privilege('anon', 'public.rpc_stay_paystack_refund_checked(uuid, text, text, text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rpc_stay_paystack_refund_checked(uuid, text, text, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_paystack_refund_open(text, uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_refund_record(uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_receipt_for_stay(uuid, boolean)', 'EXECUTE'),
  'The public key reaches neither refund record, and no account issues receipts.');

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-000000000001');
select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'processed', 'x', null, null)$$, pg_temp.id_of('stay1')),
  '42501', 'Hospitality staff only.', 'The guest cannot record it.');
select pg_temp.as_user('d2450000-0000-4000-8000-000000000031');
select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'failed', null, null, null)$$, pg_temp.id_of('stay1')),
  '42501', 'Hospitality staff only.', 'Nor can the host.');
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'refunded', 'x', null, null)$$, pg_temp.id_of('stay1')),
  '22023', 'Say whether Paystack shows the refund as processed or failed.', 'Only processed or failed.');
select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'processed', '  ', null, null)$$, pg_temp.id_of('stay1')),
  '22023', 'Enter the refund reference shown in the Paystack dashboard.',
  'Processed needs the dashboard''s reference.');
select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'processed', 'x', null, null)$$, pg_temp.id_of('stay2')),
  '22023', 'That stay has no refund due.', 'A booked stay has nothing to record.');

select public.rpc_stay_cancel_refund_full(pg_temp.id_of('stay1'), 'The home flooded');
select public.rpc_stay_cancel_refund_full(pg_temp.id_of('stay2'), 'The home flooded');
select public.rpc_stay_cancel(pg_temp.id_of('stay3'), 'The guest cannot travel');
select public.rpc_stay_cancel_refund_full(pg_temp.id_of('stay4'), 'The home flooded');

-- ──────────────────────────────────────────────────── 2. not a Paystack stay: as before

select throws_ok(
  format($$select public.rpc_stay_paystack_refund_checked(%L, 'processed', 'x', null, null)$$, pg_temp.id_of('stay4')),
  '22023', 'This stay was not paid through Paystack. Record the refund by its M-Pesa or bank reference.',
  'Only a Paystack stay is recorded from the dashboard.');
select is(
  (select refund_reference from public.rpc_stay_refund_record(pg_temp.id_of('stay4'), 'qk245mpesa', 'Reversed')),
  'QK245MPESA', 'Its refund is recorded by hand as before.');
reset role;
select is(
  (select concat_ws(':', r.total_cents, r.method, r.method_ref) from public.receipt r
    where r.source_type = 'stay_refund' and r.source_id = pg_temp.id_of('stay4')),
  '1400000:M-Pesa:QK245MPESA', 'and its receipt still says M-Pesa.');

-- ──────────────────────────────────────────────────── 3. processed, on an open refund

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
insert into t select 'ref1', public.rpc_paystack_refund_open('stay', pg_temp.id_of('stay1'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
select public.rpc_paystack_refund_answered((select v from t where k = 'ref1'),
  '{"status": true, "data": {"id": 3018401, "status": "pending", "amount": 1400000}}',
  'sk_live_ci_only_0123456789abcdef');
select throws_ok(
  format($$select public.rpc_stay_refund_record(%L, 'QK245HAND1')$$, pg_temp.id_of('stay1')),
  '22023',
  'A Paystack refund is open for this stay. Check the Paystack dashboard and record what it shows there, so the guest is not paid twice.',
  'While Paystack may still send it, it cannot be recorded another way.');
reset role;
select is(pg_temp.refund_of(pg_temp.id_of('stay1')), 'pending:false:paid', 'and nothing changed.');

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
insert into t select 'done1', public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay1'), 'processed',
  '  3018401  ', 'Seen in the dashboard', (select v from t where k = 'ref1'))::text;
select is(
  (select v::jsonb - 'refund_reference' from t where k = 'done1'),
  '{"ok": true, "changed": true, "refunded": true, "message": "Recorded as refunded through Paystack."}'::jsonb,
  'Staff record what the dashboard shows as processed.');
reset role;
select is(
  (select concat_ws('|', pg_temp.refund_of(s.id),
                    (s.refund_reference = (select v from t where k = 'ref1'))::text, s.refund_note,
                    (s.refunded_by = 'd2450000-0000-4000-8000-0000000000b1')::text)
     from public.stay s where s.id = pg_temp.id_of('stay1')),
  'processed:true:reversed|true|Seen in the dashboard|true',
  'The stay is refunded under NexG''s reference, by that person, and its payment reversed.');
select is(
  (select count(distinct x.id) || ':'
          || coalesce(sum(e.debit) filter (where e.account_code = 'cash.card_processor_receivable'), 0) || ':'
          || coalesce(sum(e.credit) filter (where e.account_code like 'stay.host\_share:%'), 0)
     from ledger.transaction x join ledger.entry e on e.transaction_id = x.id
    where x.kind = 'host_refund_by_paystack' and x.related ->> 'stay_id' = (select v from t where k = 'stay1')),
  '1:1190000:1190000', 'The split host''s KES 11,900 is credited back from Paystack, once.');
select is(
  (select coalesce(sum(e.credit - e.debit), 0)::bigint
     from ledger.entry e join ledger.transaction x on x.id = e.transaction_id
    where x.related ->> 'stay_id' = (select v from t where k = 'stay1')
      and e.account_code like 'stay.host\_share:%'),
  0::bigint, 'so the weekly run claws nothing back from the host.');
select is(pg_temp.posted(pg_temp.id_of('stay1'), 'stay_refunded'), 1,
  'The books post stay_refunded once.');
select is(
  (select concat_ws('|', count(*), min(e.after ->> 'outcome'), min(e.after ->> 'dashboard_reference'),
                    min(e.after ->> 'note'), min(e.after ->> 'state_before'), min(e.severity::text))
     from audit.audit_event e
    where e.action = 'stay.paystack_refund_checked' and e.target_id = pg_temp.id_of('stay1')),
  '1|processed|3018401|Seen in the dashboard|pending|high',
  'The audit holds the dashboard''s reference and the note.');

insert into t select 'snap1', pg_temp.snap(pg_temp.id_of('stay1'));
set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select is(
  (select (x ->> 'changed') || ':' || (x ->> 'message')
     from public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay1'), 'processed', '3018401', null,
            (select v from t where k = 'ref1')) x),
  'false:This stay''s refund is already recorded. Nothing was changed.', 'A second press says so.');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay1'), 'failed', null, null,
    (select v from t where k = 'ref1')) ->> 'changed',
  'false', 'A recorded refund cannot be turned into a failed one.');
reset role;
select is(pg_temp.snap(pg_temp.id_of('stay1')), (select v from t where k = 'snap1'),
  'Neither changed the stay, its refund or its audit entries.');

insert into t select 'late1', pg_temp.processed((select v from t where k = 'txn1'), '132013318401', '1400000');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'late1')) ->> 'duplicate', 'true',
  'Paystack''s own notice arriving afterwards changes nothing.');
reset role;
select is(pg_temp.doubles(pg_temp.id_of('stay1')), 0, 'and is no double payment.');

-- An earlier failed try that Paystack now says it processed.
insert into public.paystack_refund (kind, stay_id, payment_id, reference, amount_cents, is_test, state)
select 'stay', pg_temp.id_of('stay1'), p.id, 'NXR-245cccccccccccccccccccccccccccccc', 1400000, false, 'failed'
  from public.payment p where p.reference = (select v from t where k = 'pay1');
insert into t select 'old1', pg_temp.processed((select v from t where k = 'txn1'),
  'NXR-245cccccccccccccccccccccccccccccc', '1400000');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'old1')) ->> 'reason', 'ambiguous_refund',
  'It moves neither refund.');
reset role;
select is(
  (select concat_ws(':', count(*),
                    bool_and(e.after ->> 'recorded_reference' = (select v from t where k = 'ref1'))::text,
                    min(e.severity::text),
                    bool_and(e.after ->> 'split_host_id' = 'd2451000-0000-4000-8000-00000000000a')::text,
                    bool_and(e.reason like '%Finance may owe the host a credit.')::text)
     from audit.audit_event e
    where e.action = 'stay.refund_possible_double' and e.target_id = pg_temp.id_of('stay1')),
  '1:true:high:true:true',
  'and is audited as a possible double payment, saying the split host may be owed a credit.');

-- ──────────────────────────────────────────────────── 4. refunded straight in the dashboard

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select is(
  (select (x ->> 'changed') || ':' || (x ->> 'message')
     from public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay2'), 'failed', null, null, null) x),
  'false:No Paystack refund is open for this stay. Nothing was changed.',
  'With nothing open there is nothing to mark failed.');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay2'), 'processed', 'dash-2450002', null, null)
    ->> 'refunded',
  'true', 'A refund made in the dashboard is recorded as processed.');
reset role;
select is(
  (select concat_ws(':', count(*), min(r.state), min(r.amount_cents), bool_and(r.is_test)::text,
                    bool_and(r.created_by = 'd2450000-0000-4000-8000-0000000000b1')::text,
                    bool_and(r.reference = s.refund_reference)::text,
                    bool_and(s.refunded_by = 'd2450000-0000-4000-8000-0000000000b1')::text,
                    min(s.refund_note))
     from public.paystack_refund r join public.stay s on s.id = r.stay_id
    where s.id = pg_temp.id_of('stay2')),
  '1:processed:1400000:false:true:true:true:Checked in the Paystack dashboard',
  'NexG now holds that refund, for the KES 14,000 due, and the stay carries its reference.');
select is(
  pg_temp.refund_of(pg_temp.id_of('stay2')) || ' ' || pg_temp.posted(pg_temp.id_of('stay2'), 'stay_refunded'),
  'processed:true:reversed 1', 'The payment is reversed and the books post the refund.');
select is(
  (select concat_ws(':', r.total_cents, r.lines #>> '{0,amount_cents}', r.method,
                    (r.method_ref = s.refund_reference)::text)
     from public.receipt r join public.stay s on s.id = r.source_id
    where r.source_type = 'stay_refund' and s.id = pg_temp.id_of('stay2')),
  '1400000:1400000:Paystack:true', 'A Paystack mobile money refund''s receipt says Paystack, not M-Pesa.');
select is(
  (select e.after ->> 'dashboard_reference' from audit.audit_event e
    where e.action = 'stay.paystack_refund_checked' and e.target_id = pg_temp.id_of('stay2')),
  'dash-2450002', 'The dashboard''s reference is audited.');

-- ──────────────────────────────────────────────────── 5. failed, then sent by hand

set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
insert into t select 'ref3', public.rpc_paystack_refund_open('stay', pg_temp.id_of('stay3'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
select throws_ok(
  format($$select public.rpc_stay_refund_record(%L, 'QK245HAND3')$$, pg_temp.id_of('stay3')),
  '22023',
  'A Paystack refund is open for this stay. Check the Paystack dashboard and record what it shows there, so the guest is not paid twice.',
  'A try with no answer yet also holds the hand record back.');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay3'), 'failed', null, 'Paystack declined it',
      (select v from t where k = 'ref3'))
    - 'refund_reference',
  '{"ok": true, "changed": true, "refunded": false, "message": "Marked failed. Nothing is recorded as refunded; the refund can be sent again."}'::jsonb,
  'Staff record what the dashboard shows as failed.');
reset role;
select is(
  pg_temp.refund_of(pg_temp.id_of('stay3')) || '|'
    || (select r.failure_reason from public.paystack_refund r where r.reference = (select v from t where k = 'ref3')),
  'failed:false:paid|Paystack declined it', 'The try is failed and nothing is marked refunded.');
insert into t select 'snap3', pg_temp.snap(pg_temp.id_of('stay3'));
set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay3'), 'failed', null, 'Again',
    (select v from t where k = 'ref3')) ->> 'changed',
  'false', 'Marking it failed again says nothing changed.');
reset role;
select is(pg_temp.snap(pg_temp.id_of('stay3')), (select v from t where k = 'snap3'), 'and nothing did.');

-- The refund is sent again; a form still showing the first try is submitted.
set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
insert into t select 'ref3b', public.rpc_paystack_refund_open('stay', pg_temp.id_of('stay3'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
reset role;
insert into t select 'snap3b', pg_temp.snap(pg_temp.id_of('stay3'));
set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay3'), 'failed', null, 'Old form',
    (select v from t where k = 'ref3')),
  '{"ok": true, "changed": false, "refunded": false, "message": "This stay''s Paystack refund has changed since the page was loaded. Nothing was changed. Check the one shown now."}'::jsonb,
  'An old failed answer does not touch the new try.');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay3'), 'processed', '3018403', null,
    (select v from t where k = 'ref3')) ->> 'changed',
  'false', 'Nor does an old processed answer mark it refunded.');
reset role;
select is(pg_temp.snap(pg_temp.id_of('stay3')), (select v from t where k = 'snap3b'),
  'The new try, the stay and its audit entries are as they were.');
set local role authenticated;
select pg_temp.as_user('d2450000-0000-4000-8000-0000000000aa');
select is(
  public.rpc_stay_paystack_refund_checked(pg_temp.id_of('stay3'), 'failed', null, 'Declined again',
    (select v from t where k = 'ref3b')) ->> 'changed',
  'true', 'The try on screen can be marked failed.');
select is(
  (select refund_reference from public.rpc_stay_refund_record(pg_temp.id_of('stay3'), 'QK245HAND3', 'Sent by M-Pesa')),
  'QK245HAND3', 'With only failed tries, a refund sent by hand is recorded as before.');
reset role;
select is(
  (select concat_ws(':', r.total_cents, r.method, r.method_ref) from public.receipt r
    where r.source_type = 'stay_refund' and r.source_id = pg_temp.id_of('stay3')),
  '700000:M-Pesa or bank:QK245HAND3',
  'A card payment refunded by hand is not said to have gone to the card.');

insert into t values
  ('byTxn3', pg_temp.processed((select v from t where k = 'txn3'), '132013318403', '700000')),
  ('byRef3', pg_temp.processed((select v from t where k = 'txn3'), (select v from t where k = 'ref3'), '700000'));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'byTxn3')) ->> 'reason', 'unknown_refund',
  'A processed notice for the hand-recorded stay matches no open refund.');
reset role;
select is(
  (select concat_ws(':', count(*), min(e.after ->> 'recorded_reference'), min(e.severity::text),
                    min(m.review_state), bool_or(e.reason like '%split to the host%')::text)
     from audit.audit_event e left join audit.event_meta m on m.event_id = e.id
    where e.action = 'stay.refund_possible_double' and e.target_id = pg_temp.id_of('stay3'))
  || ' ' || (select count(*) from audit.audit_event e
              where e.action = 'payment.paystack_refund_unmatched'
                and e.after ->> 'transaction' = (select v from t where k = 'txn3')),
  '1:QK245HAND3:high:needs_review:false 0',
  'It is a possible double payment for a person to review, with no host split to mention.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'byRef3')) ->> 'state', 'processed',
  'Paystack processing the failed try after all is kept.');
reset role;
select is(
  pg_temp.doubles(pg_temp.id_of('stay3')) || ':'
    || (select s.refund_reference from public.stay s where s.id = pg_temp.id_of('stay3')) || ':'
    || (select r.state from public.paystack_refund r where r.reference = (select v from t where k = 'ref3')),
  '2:QK245HAND3:processed', 'The hand record stays, and the second payment is flagged.');

-- ──────────────────────────────────────────────────── 6. the audit actions

select results_eq(
  $$select action collate "C", module, default_severity::text, needs_review, money
      from audit.action_registry
     where action in ('stay.paystack_refund_checked', 'stay.refund_possible_double')
     order by 1$$,
  $$values
    ('stay.paystack_refund_checked' collate "C", 'hotels', 'high', false, true),
    ('stay.refund_possible_double', 'hotels', 'high', true, true)$$,
  'The two new actions are registered.');

select * from finish();
rollback;
