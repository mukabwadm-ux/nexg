-- Hosts paid by Paystack sub-accounts: NexG's stay commission is 15% unless a
-- rate is agreed with the host (one Finance person asks, another approves);
-- a second Finance person switches a host's sub-account on; checkout then
-- splits the host's share to it; the books show the host paid, so the weekly
-- run never pays it again, and a cancelled stay's refund comes back from the
-- sub-account once Paystack has refunded it (a refund NexG records by hand is
-- clawed back in the weekly run). A rate approved after a stay is held never
-- changes that stay. NexG edits the preset cancellation policies the same way.
-- No guest has more than two live holds (rpc_stay_hold allows two): a second
-- guest holds stays 4 and T.

begin;
create extension if not exists pgtap with schema extensions;
select plan(41);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_live_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint,
                                p_subaccount text default 'ACCT_ci2120001') returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'card', 'fees', 4350,
      'gateway_response', 'Approved',
      'subaccount', case when p_subaccount is null then '{}'::jsonb
                         else jsonb_build_object('subaccount_code', p_subaccount) end))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_state text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end
$$;
create function pg_temp.refund_event(p_reference text, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'refund.processed',
    'data', jsonb_build_object('id', 921299, 'refund_reference', p_reference, 'amount', p_amount,
      'currency', 'KES', 'status', 'processed'))::text
$$;
/* The host's stay.host_share balance on one stay's ledger lines. */
create function pg_temp.host_owed_on(p_stay uuid) returns bigint language sql as $$
  select coalesce(sum(e.credit - e.debit), 0)::bigint
    from ledger.entry e join ledger.transaction t on t.id = e.transaction_id
   where t.related ->> 'stay_id' = p_stay::text and e.account_code like 'stay.host\_share:%'
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000021', 'authenticated',
   'authenticated', 'stay.guest212@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000022', 'authenticated',
   'authenticated', 'stay.guest212b@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000006', 'authenticated',
   'authenticated', 'finance212a@test.local', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000007', 'authenticated',
   'authenticated', 'finance212b@test.local', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000008', 'authenticated',
   'authenticated', 'partners212@test.local', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000031', 'authenticated',
   'authenticated', 'host212@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2120000-0000-4000-8000-000000000041', 'authenticated',
   'authenticated', 'stranger212@example.test', '', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2120000-0000-4000-8000-0000000000b1', 'c2120000-0000-4000-8000-000000000006', 'finance212a@test.local', 'Finance 212 A'),
  ('c2120000-0000-4000-8000-0000000000b2', 'c2120000-0000-4000-8000-000000000007', 'finance212b@test.local', 'Finance 212 B'),
  ('c2120000-0000-4000-8000-0000000000b3', 'c2120000-0000-4000-8000-000000000008', 'partners212@test.local', 'Partnerships 212');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select s.id, r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       case when s.id = 'c2120000-0000-4000-8000-0000000000b1'::uuid
            then 'c2120000-0000-4000-8000-0000000000b2'::uuid
            else 'c2120000-0000-4000-8000-0000000000b1'::uuid end
  from public.staff_user s, public.role r
 where r.key = 'finance'
   and s.id in ('c2120000-0000-4000-8000-0000000000b1', 'c2120000-0000-4000-8000-0000000000b2');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
values ('c2120000-0000-4000-8000-0000000000b3', (select id from public.role where key = 'partnerships'),
        (select id from public.city where slug = 'nairobi'), 'c2120000-0000-4000-8000-0000000000b3');

-- One host: a real property (moderate policy) and a test property.
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c2121000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 212]', '+254700021200',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.host_user (host_id, user_id, role, units)
values ('c2121000-0000-4000-8000-00000000000a', 'c2120000-0000-4000-8000-000000000031', 'owner', null);
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, cancellation_terms)
values
  ('c2122000-0000-4000-8000-00000000000a', 'c2121000-0000-4000-8000-00000000000a', 'block-212', '[Block 212]',
   'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'), true, now(),
   public.fn_cancellation_policy('{"preset":"moderate"}')),
  ('c2122000-0000-4000-8000-00000000000b', 'c2121000-0000-4000-8000-00000000000a', 'block-212-test', '[Test block 212]',
   'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'), true, now(), null);
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('c2123000-0000-4000-8000-00000000000a', 'c2121000-0000-4000-8000-00000000000a',
   'c2122000-0000-4000-8000-00000000000a', 'A', 'A', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000),
  ('c2123000-0000-4000-8000-00000000000b', 'c2121000-0000-4000-8000-00000000000a',
   'c2122000-0000-4000-8000-00000000000b', 'T', 'T', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000);

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;
insert into t values ('h', 'c2121000-0000-4000-8000-00000000000a');

-- ── 1. the rate: 15% unless agreed; one asks, another approves

select is((public.fn_host_commission('c2121000-0000-4000-8000-00000000000a') ->> 'preset_pct')::numeric,
  15::numeric, 'NexG''s stay commission is 15% by default.');

set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000021');
select is(pg_temp.hint_of($$select public.rpc_host_commission_request('c2121000-0000-4000-8000-00000000000a',
  12, current_date, null, 'Agreed', null)$$), '42501', 'A customer cannot ask for a host''s rate.');

select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
insert into t select 'ask', public.rpc_host_commission_request('c2121000-0000-4000-8000-00000000000a',
  12, (now() at time zone 'Africa/Nairobi')::date, null, 'Twelve percent for a year of exclusivity', 'Email 24 Nov')::text;
select is((select v::jsonb #>> '{terms,0,status}' from t where k = 'ask'), 'pending',
  'Finance asks for 12%; it waits for a second person.');
insert into t select 'term', v::jsonb #>> '{terms,0,id}' from t where k = 'ask';
select is(pg_temp.hint_of(format($$select public.rpc_host_commission_decide(%L, true)$$,
  (select v from t where k = 'term'))), '42501', 'The person who asked cannot approve it.');

select pg_temp.as_user('c2120000-0000-4000-8000-000000000007');
select is((public.rpc_host_commission_decide((select v::uuid from t where k = 'term'), true)
  #>> '{charged_now,pct}')::numeric, 12::numeric, 'A second Finance person approves; the host is charged 12%.');
reset role;
/* Everything here runs in one transaction, where now() (and so every stay's
   created_at) is its start: date the approval just before it, as if it was
   approved before the guests came. */
update public.host_commission_term set decided_at = now() - interval '1 minute'
 where id = (select v::uuid from t where k = 'term');
set local role authenticated;

-- ── 2. the sub-account: two people, a fresh look-up

select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
select is(pg_temp.hint_of($$select public.rpc_host_subaccount_request('c2121000-0000-4000-8000-00000000000a',
  true, 'ACCT_ci2120002', 'auto', '{}')$$), '22023', 'No test sub-account for a host without a test property.');
insert into t select 'sub', public.rpc_host_subaccount_request('c2121000-0000-4000-8000-00000000000a', false,
  'ACCT_ci2120001', 'manual', '{"business_name": "[Host 212]", "account_last4": "1234"}', 'Made in the dashboard') ->> 'id';
select is(pg_temp.hint_of(format($$select public.rpc_host_subaccount_decide(%L, true)$$,
  (select v from t where k = 'sub'))), '42501', 'The person who recorded it cannot switch it on.');

select pg_temp.as_user('c2120000-0000-4000-8000-000000000007');
select is(pg_temp.hint_of(format($$select public.rpc_host_subaccount_decide(%L, true)$$,
  (select v from t where k = 'sub'))), '22023', 'Not without their own look-up in Paystack.');
select is(public.rpc_host_subaccount_decide((select v::uuid from t where k = 'sub'), true, null,
  '{"subaccount_code": "ACCT_ci2120001", "test": false, "business_name": "[Host 212]", "account_last4": "1234"}') ->> 'status',
  'active', 'A second Finance person switches it on, on their own look-up.');

-- ── 3. the guest holds stays and starts paying

select pg_temp.as_user('c2120000-0000-4000-8000-000000000021');
insert into t select 'stay1', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000a',
  current_date + 30, current_date + 32, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'stay3', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000a',
  current_date + 40, current_date + 42, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'ref1', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay1')) ->> 'reference';
insert into t select 'ref3', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay3')) ->> 'reference';

-- A second guest, so nobody has more than two stays on hold.
select pg_temp.as_user('c2120000-0000-4000-8000-000000000022');
insert into t select 'stay4', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000a',
  current_date + 50, current_date + 52, '{"first_name":"Baraka"}'::jsonb) ->> 'stay_id';
insert into t select 'stayT', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000b',
  current_date + 30, current_date + 32, '{"first_name":"Baraka"}'::jsonb) ->> 'stay_id';
insert into t select 'ref4', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay4')) ->> 'reference';
insert into t select 'refT', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stayT')) ->> 'reference';

-- After the stays are held, NexG agrees 10% with the host.
select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
insert into t select 'ask2', public.rpc_host_commission_request('c2121000-0000-4000-8000-00000000000a',
  10, (now() at time zone 'Africa/Nairobi')::date, null, 'Ten percent from today', null)::text;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000007');
select public.rpc_host_commission_decide((select (v::jsonb #>> '{terms,0,id}')::uuid from t where k = 'ask2'), true);
reset role;

update public.property set accepts_test_payments = true where id = 'c2122000-0000-4000-8000-00000000000b';

set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
insert into t select 'subT', public.rpc_host_subaccount_request('c2121000-0000-4000-8000-00000000000a', true,
  'ACCT_ci2120002', 'auto', '{"business_name": "[Host 212 test]"}') ->> 'id';
select pg_temp.as_user('c2120000-0000-4000-8000-000000000007');
select public.rpc_host_subaccount_decide((select v::uuid from t where k = 'subT'), true, null,
  '{"subaccount_code": "ACCT_ci2120002", "test": true}');

-- ── 4. checkout splits it

select pg_temp.as_user('c2120000-0000-4000-8000-000000000021');
insert into t select 'try1', public.rpc_payment_paystack_attempt((select v from t where k = 'ref1'), 'card', null,
  'sk_live_ci_only_0123456789abcdef')::text;
/* Worked out by hand from the fixture, so a change to the split maths breaks this:
   unit A is KES 7,000 a night, stay1 is 2 nights = KES 14,000 (1,400,000 cents);
   the host's agreed rate is 12% = KES 1,680, so NexG's transaction_charge is
   168,000 cents and the host's sub-account gets KES 12,320. */
select is((select v::jsonb -> 'split' from t where k = 'try1'),
  '{"subaccount": "ACCT_ci2120001", "transaction_charge": 168000, "bearer": "account"}'::jsonb,
  'The host''s share goes to its sub-account; NexG keeps its 12% and pays the fee.');
select public.rpc_payment_paystack_opened((select v from t where k = 'ref1') || '-1', 'acc_ci212',
  'https://checkout.paystack.com/ci-212', null, 'sk_live_ci_only_0123456789abcdef');
insert into t select 'try3', public.rpc_payment_paystack_attempt((select v from t where k = 'ref3'), 'card', null,
  'sk_live_ci_only_0123456789abcdef')::text;
select public.rpc_payment_paystack_opened((select v from t where k = 'ref3') || '-1', 'acc_ci212c',
  'https://checkout.paystack.com/ci-212c', null, 'sk_live_ci_only_0123456789abcdef');
reset role;

-- ── 5. the books

insert into t select 'paid1', pg_temp.ps_paid((select v from t where k = 'ref1') || '-1', 921201,
  (select amount_cents from public.payment where reference = (select v from t where k = 'ref1')));
insert into t select 'paid3', pg_temp.ps_paid((select v from t where k = 'ref3') || '-1', 921203,
  (select amount_cents from public.payment where reference = (select v from t where k = 'ref3')), null);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'paid1'),
  pg_temp.ps_sign((select v from t where k = 'paid1'))) ->> 'state', 'paid', 'Paystack''s signed success pays the stay.');
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid3'),
  pg_temp.ps_sign((select v from t where k = 'paid3')));
reset role;

/* Read as the setup role (reset role above). By hand: stay1 = 2 nights x
   KES 7,000 = KES 14,000 paid; 12% of 14,000 = KES 1,680 commission; the
   host's share is 14,000 - 1,680 = KES 12,320. commission_pct is numeric(5,2). */
select is((select status || ':' || commission_pct || ':' || paid_kes || ':' || commission_kes
                  || ':' || host_share_kes
             from public.stay where id = (select v::uuid from t where k = 'stay1')),
  'booked:12.00:14000:1680:12320',
  'The stay is booked at the agreed 12%, and the host''s share is the rest.');
select ok((select commission_pct = 12 from public.stay where id = (select v::uuid from t where k = 'stay1'))
          and (public.fn_host_commission('c2121000-0000-4000-8000-00000000000a') ->> 'pct')::numeric = 10,
  'A rate approved after the stay was held does not change that stay''s commission.');
/* The settle books a split payment as it was sent, so comparing the two
   columns with each other cannot fail. Both against the hand-worked share:
   KES 12,320 (14,000 - 12% of 14,000) = 1,232,000 cents. */
select is((select a.split_share_cents || ':'
                  || (select host_share_kes * 100 from public.stay where id = (select v::uuid from t where k = 'stay1'))
             from public.paystack_attempt a
            where a.reference = (select v from t where k = 'ref1') || '-1'),
  '1232000:1232000',
  'What Paystack sent the host is exactly the host''s share the settle worked out.');
select is((select count(*)::int from ledger.transaction
            where kind = 'host_paid_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay1')),
  1, 'The books record that Paystack paid the host.');
select is(pg_temp.host_owed_on((select v::uuid from t where k = 'stay1')), 0::bigint,
  'Nothing on the stay is left owed to the host.');
select is((select coalesce(sum(e.credit - e.debit), 0)::bigint
            from public.fn_settlement_owed(now() - interval '30 days', now() + interval '1 day') o
            join ledger.entry e on e.id = any (o.entry_ids)
            join ledger.transaction x on x.id = e.transaction_id
           where o.party_id = 'c2121000-0000-4000-8000-00000000000a'
             and x.related ->> 'stay_id' = (select v from t where k = 'stay1')),
  0::bigint, 'The weekly run would pay nothing more for it.');
select ok(exists (select 1 from public.receipt
                   where party_type = 'host' and source_id = (select v::uuid from t where k = 'stay1')
                     and lines @> '[{"label": "NexG commission (12%)"}]'::jsonb),
  'The host''s receipt names the 12% charged.');
select ok(exists (select 1 from public.host_message
                   where host_id = 'c2121000-0000-4000-8000-00000000000a'
                     and body like '%after NexG''s 12% is KES 12,320.'),
  'The host is told the rate they were charged.');

-- Paystack did not split stay 3: the weekly run pays it.
select is((select count(*)::int from ledger.transaction
            where kind = 'host_paid_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay3'))
          + (select count(*)::int from public.paystack_attempt
              where reference = (select v from t where k = 'ref3') || '-1' and split_host_id is not null),
  0, 'A payment Paystack did not split posts nothing and loses its split.');
select is((select count(*)::int from audit.audit_event
            where action = 'payment.split_not_made' and target_type = 'host'
              and target_id = 'c2121000-0000-4000-8000-00000000000a'),
  1, 'and it is flagged for Finance.');
/* By hand: stay3 = 2 nights x KES 7,000 = KES 14,000, held before the 10%
   term was approved, so 12% = KES 1,680; the host is owed KES 12,320 =
   1,232,000 cents. */
select is(pg_temp.host_owed_on((select v::uuid from t where k = 'stay3')), 1232000::bigint,
  'The host''s share of it stays owed for the weekly run.');
/* The positive control for "the weekly run would pay nothing more" above: the
   same run query sees the host's KES 12,320 on the unsplit stay. */
select is((select coalesce(sum(e.credit - e.debit), 0)::bigint
            from public.fn_settlement_owed(now() - interval '30 days', now() + interval '1 day') o
            join ledger.entry e on e.id = any (o.entry_ids)
            join ledger.transaction x on x.id = e.transaction_id
           where o.party_id = 'c2121000-0000-4000-8000-00000000000a'
             and x.related ->> 'stay_id' = (select v from t where k = 'stay3')),
  1232000::bigint, 'and the weekly run would pay the host exactly that.');

-- ── 6. NexG cancels the split stay: once Paystack refunds it, the refund comes back from the sub-account

set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000008');
select public.rpc_stay_cancel((select v::uuid from t where k = 'stay1'), 'The guest cannot travel');
insert into t select 'rr1', public.rpc_paystack_refund_open('stay', (select v::uuid from t where k = 'stay1'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
reset role;
select is((select count(*)::int from ledger.transaction
            where kind = 'host_refund_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay1')),
  0, 'Cancelling alone takes nothing back from the sub-account: it waits for Paystack''s refund.');

insert into t select 'rp1', pg_temp.refund_event((select v from t where k = 'rr1'),
  (select amount_cents from public.paystack_refund where reference = (select v from t where k = 'rr1')));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'rp1'),
  pg_temp.ps_sign((select v from t where k = 'rp1')));
reset role;
select is((select count(*)::int from ledger.transaction
            where kind = 'host_refund_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay1')),
  1, 'The host''s part of the refund is taken back from the sub-account.');
select is(pg_temp.host_owed_on((select v::uuid from t where k = 'stay1')), 0::bigint,
  'so nothing is clawed back from the host in the weekly run.');

-- A split stay refunded by hand (M-Pesa, recorded): no credit-back; the weekly run claws the host's part back.
set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000021');
insert into t select 'stay6', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000a',
  current_date + 60, current_date + 62, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'ref6', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay6')) ->> 'reference';
select public.rpc_payment_paystack_attempt((select v from t where k = 'ref6'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'ref6') || '-1', 'acc_ci212f',
  'https://checkout.paystack.com/ci-212f', null, 'sk_live_ci_only_0123456789abcdef');
reset role;
insert into t select 'paid6', pg_temp.ps_paid((select v from t where k = 'ref6') || '-1', 921206,
  (select amount_cents from public.payment where reference = (select v from t where k = 'ref6')));
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid6'),
  pg_temp.ps_sign((select v from t where k = 'paid6')));
set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000008');
select public.rpc_stay_cancel((select v::uuid from t where k = 'stay6'), 'The guest cannot travel');
select public.rpc_stay_refund_record((select v::uuid from t where k = 'stay6'), 'QK212REFUND6', 'Sent by M-Pesa');
reset role;
select ok((select count(*) from ledger.transaction
            where kind = 'host_refund_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay6')) = 0
          and (select count(*) from ledger.transaction
                where kind = 'host_paid_by_paystack' and related ->> 'stay_id' = (select v from t where k = 'stay6')) = 1
          and pg_temp.host_owed_on((select v::uuid from t where k = 'stay6')) < 0,
  'A refund recorded by hand takes nothing back from the sub-account; the weekly run claws the host''s part back.');

-- ── 7. a test property: split, but nothing on the books

set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000022');
select is(public.rpc_payment_paystack_attempt((select v from t where k = 'refT'), 'card', null,
  'sk_test_ci_only_0123456789abcdef') #>> '{split,subaccount}', 'ACCT_ci2120002',
  'A test stay is split to the host''s test sub-account.');
select public.rpc_payment_paystack_opened((select v from t where k = 'refT') || '-1', 'acc_ci212t',
  'https://checkout.paystack.com/ci-212t', null, 'sk_test_ci_only_0123456789abcdef');
reset role;
insert into t select 'paidT', pg_temp.ps_paid((select v from t where k = 'refT') || '-1', 921204,
  (select amount_cents from public.payment where reference = (select v from t where k = 'refT')), 'ACCT_ci2120002');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paidT'),
  pg_temp.ps_sign((select v from t where k = 'paidT'), 'sk_test_ci_only_0123456789abcdef'));
reset role;
select is((select status from public.stay where id = (select v::uuid from t where k = 'stayT'))
          || ':' || (select count(*) from ledger.transaction
                      where related ->> 'stay_id' = (select v from t where k = 'stayT')),
  'booked:0', 'A test stay is booked and posts nothing to the ledger.');

-- ── 8. paused: no split

set local role authenticated;
select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
select public.rpc_host_subaccount_pause((select v::uuid from t where k = 'sub'), true, 'Bank details changing');
select pg_temp.as_user('c2120000-0000-4000-8000-000000000022');
/* Not a bare comparison of the split with null: the answer must be a real attempt
   (ok true) that carries no split key. */
select is((select (r ->> 'ok') || ':' || (r ? 'split')::text
             from (select public.rpc_payment_paystack_attempt((select v from t where k = 'ref4'), 'card', null,
                     'sk_live_ci_only_0123456789abcdef') as r) q),
  'true:false',
  'Paused: new stays are not split and go to the weekly run.');

-- ── 9. who sees what

select pg_temp.as_user('c2120000-0000-4000-8000-000000000031');
/* The term count (both approved: 12% and 10%) keeps the 0 from passing on an
   empty list. */
select is((select (r ->> 'viewer') || ':' || jsonb_array_length(r -> 'terms') || ':'
                  || (select count(*) from jsonb_array_elements(r -> 'terms') x
                       where x ? 'reason' or x ? 'requested_by_name' or x ? 'decision_note')
             from (select public.rpc_host_commission_read('c2121000-0000-4000-8000-00000000000a') as r) q),
  'host:2:0', 'The host sees their rate without staff names or notes.');
select is((select (r ->> 'viewer') || ':' || jsonb_array_length(r -> 'subaccounts') || ':'
                  || (select count(*) from jsonb_array_elements(r -> 'subaccounts') x
                       where x ? 'requestedByName' or x ? 'note')
             from (select public.rpc_host_split_overview('c2121000-0000-4000-8000-00000000000a') as r) q),
  'host:2:0', 'The host sees their sub-accounts in use, without staff names or notes.');
select pg_temp.as_user('c2120000-0000-4000-8000-000000000041');
select is(pg_temp.hint_of($$select public.rpc_host_commission_read('c2121000-0000-4000-8000-00000000000a')$$),
  '42501', 'A stranger cannot read a host''s rate.');
select is(pg_temp.hint_of($$select public.rpc_host_split_overview('c2121000-0000-4000-8000-00000000000a')$$),
  '42501', 'A stranger cannot read a host''s Paystack payouts.');

-- ── 10. NexG edits a preset

select pg_temp.as_user('c2120000-0000-4000-8000-000000000006');
insert into t select 'preset', public.rpc_cancellation_preset_request('moderate',
  '[{"days_before":10,"refund_pct":100},{"days_before":3,"refund_pct":50},{"days_before":0,"refund_pct":0}]',
  'Guests book further ahead now') #>> '{presets,1,pending,id}';
select is(pg_temp.hint_of(format($$select public.rpc_cancellation_preset_decide(%L, true)$$,
  (select v from t where k = 'preset'))), '42501', 'The person who asked cannot approve a preset change.');
select is(pg_temp.hint_of($$select public.rpc_cancellation_preset_request('strict',
  '[{"days_before":7,"refund_pct":50},{"days_before":0,"refund_pct":100}]', 'Wrong way round')$$),
  '22023', 'A preset never gives more back for cancelling later.');
select is(pg_temp.hint_of($$select public.rpc_cancellation_preset_request('strict',
  '[{"days_before":14,"refund_pct":100},{"days_before":7,"refund_pct":50}]', 'No last day')$$),
  '22023', 'A preset''s last step is the day of check-in.');
select pg_temp.as_user('c2120000-0000-4000-8000-000000000007');
select is(public.rpc_cancellation_preset_decide((select v::uuid from t where k = 'preset'), true)
  #>> '{presets,1,tiers,0,days_before}', '10', 'A second Finance person approves the new moderate policy.');

select pg_temp.as_user('c2120000-0000-4000-8000-000000000021');
insert into t select 'stay5', public.rpc_stay_hold('c2123000-0000-4000-8000-00000000000a',
  current_date + 70, current_date + 72, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
reset role;
select is((select cancellation_terms #>> '{tiers,0,days_before}' from public.stay
            where id = (select v::uuid from t where k = 'stay5')), '10',
  'A new hold copies the new tiers.');
select is((select cancellation_terms #>> '{tiers,0,days_before}' from public.stay
            where id = (select v::uuid from t where k = 'stay3')), '5',
  'A stay already made keeps the tiers it was held under.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and finding ~ '(host_commission|host_subaccount|host_paystack|host_split|stay_split|cancellation_preset|stay_commission)'),
  0, 'The wiring check finds nothing wrong with host sub-accounts, rates or presets.');

select * from finish();
rollback;
