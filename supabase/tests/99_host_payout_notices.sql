-- Hosts hear about their payouts, cancellations and payout details.
--
-- A paid payout gets a receipt, emailed, and a minus line on the host's
-- statement. A booking NexG cancels is emailed to the host. New payout
-- details, and their verification, are emailed to the host too.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d9900000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest99n@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d9900000-0000-4000-8000-000000000003',
   'authenticated','authenticated','host99n@example.test',now(),false,now(),now());

insert into public.host (id, kind, display_name, phone, email, city_id, status, verified_at, went_live_at)
values
  ('d9910000-0000-4000-8000-00000000000a','multi_unit','[Host 99n]','+254700099000','host99n@example.test',
   (select id from public.city where slug = 'nairobi'),'live', now(), now()),
  ('d9910000-0000-4000-8000-00000000000b','multi_unit','[Host 99n no email]','+254700099001',null,
   (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('d9910000-0000-4000-8000-00000000000a','d9900000-0000-4000-8000-000000000003','owner');
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d9920000-0000-4000-8000-00000000000a','d9910000-0000-4000-8000-00000000000a',
        'block-99n','Block 99','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d9930000-0000-4000-8000-00000000000a','d9910000-0000-4000-8000-00000000000a',
        'd9920000-0000-4000-8000-00000000000a','A','Studio A','[Address]','Kilimani',
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

-- ══════════════════════════════════════════════════════════ payout details

insert into public.host_payout (host_id, rail, account)
values ('d9910000-0000-4000-8000-00000000000a', 'mpesa_phone',
        '{"phoneNumber": "+254712345678", "accountName": "Test Host"}');

select is(
  (select subject || ' · ' || (body like '%M-PESA number •••• 5678%')::text
          || ' · ' || (body like '%did not ask for this change%')::text
     from public.notification_outbox
    where template = 'host_payout_details' and recipient = 'host99n@example.test'),
  'Your NexG payout details were saved · true · true',
  'New payout details are emailed to the host, masked, with a warning if they did not ask');

update public.host_payout set verified_version = 1, verified_at = now()
 where host_id = 'd9910000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.notification_outbox
    where template = 'host_payout_verified' and recipient = 'host99n@example.test'
      and body like '%•••• 5678%'),
  1,
  'and so is Finance verifying them');

update public.host_payout set rail = 'mpesa_till', account = '{"tillNumber": "5123456"}',
       version = 2, verified_version = null, verified_at = null
 where host_id = 'd9910000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.notification_outbox
    where template = 'host_payout_details' and recipient = 'host99n@example.test'),
  2,
  'Declaring again emails the host again');

select lives_ok(
  $$insert into public.host_payout (host_id, rail, account)
    values ('d9910000-0000-4000-8000-00000000000b', 'mpesa_phone',
            '{"phoneNumber": "+254712340000", "accountName": "No Email"}')$$,
  'A host with no email on file can still be given payout details');

select is(
  (select count(*)::int from public.notification_outbox where recipient is null or recipient = ''),
  0,
  'and nothing is queued for them');

-- ═══════════════════════════════════════════════════════════════ a payout

do $$
begin
  perform ledger.post('stay_paid', 'tap:hpn:stay', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 1700000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'd9910000-0000-4000-8000-00000000000a', 'credit', 1700000)));
  perform ledger.post('host_referral_credited', 'tap:hpn:reward', jsonb_build_array(
    jsonb_build_object('account', 'expense.referral_reward', 'debit', 300000),
    jsonb_build_object('account', 'payable.host_credit', 'party_type', 'host',
                       'party_id', 'd9910000-0000-4000-8000-00000000000a', 'credit', 300000)));
end
$$;

insert into public.fin_settlement_run (id, reference, period_start, period_end, cutoff_at, pay_date)
values ('d9940000-0000-4000-8000-00000000000a', 'RUN-TAP-HPN',
        now() - interval '400 days', now() - interval '393 days', now() - interval '393 days',
        (now() - interval '392 days')::date);

insert into public.fin_settlement_line (id, run_id, party_type, party_id, party_label, rail,
                                        destination_masked, gross_cents, net_cents, ledger_entry_ids)
values ('d9950000-0000-4000-8000-00000000000a', 'd9940000-0000-4000-8000-00000000000a',
        'host', 'd9910000-0000-4000-8000-00000000000a', '[Host 99n]', 'mpesa_b2c', '•••• 5678',
        2000000, 2000000,
        (select array_agg(e.id) from ledger.entry e
          where e.account_code in ('stay.host_share:d9910000-0000-4000-8000-00000000000a',
                                   'payable.host_credit:d9910000-0000-4000-8000-00000000000a')));

select is(
  (select count(*)::int from public.receipt where source_type = 'fin_settlement_line'),
  0,
  'A payout line that is not yet paid has no receipt');

update public.fin_settlement_line
   set state = 'paid', paid_at = now(), provider_ref = 'QAB12CD34'
 where id = 'd9950000-0000-4000-8000-00000000000a';

select is(
  (select jsonb_build_object('kind', kind, 'total', total_cents, 'method', method, 'ref', method_ref,
                             'lines', lines)
     from public.receipt
    where source_type = 'fin_settlement_line' and source_id = 'd9950000-0000-4000-8000-00000000000a'
      and party_type = 'host'),
  jsonb_build_object('kind', 'payout', 'total', 2000000, 'method', 'M-Pesa', 'ref', 'QAB12CD34',
    'lines', jsonb_build_array(
      jsonb_build_object('label', 'Stay earnings', 'amount_cents', 1700000),
      jsonb_build_object('label', 'Referral rewards', 'amount_cents', 300000))),
  'Paid, the host gets a payout receipt: stays and rewards, the total sent, and the M-Pesa reference');

select is(
  (select count(*)::int from public.notification_outbox
    where template = 'receipt' and recipient = 'host99n@example.test'
      and payload ->> 'receipt' = (select number from public.receipt
                                    where source_id = 'd9950000-0000-4000-8000-00000000000a')),
  1,
  'and it is emailed to them');

update public.fin_settlement_line set paid_at = now() where id = 'd9950000-0000-4000-8000-00000000000a';
update public.fin_settlement_line set state = 'failed' where id = 'd9950000-0000-4000-8000-00000000000a';
update public.fin_settlement_line set state = 'paid' where id = 'd9950000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.receipt where source_id = 'd9950000-0000-4000-8000-00000000000a'),
  1,
  'Marked paid again, it never gets a second receipt');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d9900000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select jsonb_build_object('amount', amount_cents, 'memo', memo, 'kind', transaction_kind)
     from public.host_statement_v where line_kind = 'payout'),
  jsonb_build_object('amount', -2000000, 'memo', 'Paid to •••• 5678 · QAB12CD34',
                     'kind', 'settlement_payout'),
  'The host''s statement shows the payout as a minus line');

reset role;

-- ═════════════════════════════════════════════════════════ a cancellation

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d9900000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t (k, v) select 'stay', public.rpc_stay_hold('d9930000-0000-4000-8000-00000000000a',
  (select today + 10 from d), (select today + 12 from d)) ->> 'stay_id';
insert into t (k, v) select 'ref', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay')) ->> 'reference';
reset role;

select public.rpc_payment_webhook(
  p_event => 'test.settled', p_reference => (select v from t where k = 'ref'),
  p_dedupe_key => 'test99n', p_signature_ok => true, p_payload => '{}'::jsonb, p_paid => true,
  p_provider_ref => 'CHECKOUT-99N', p_amount_cents => 1000000, p_channel => 'mpesa');

update public.stay set status = 'cancelled', refund_due_at = now()
 where id = (select v::uuid from t where k = 'stay');

select is(
  (select (subject like 'Booking cancelled · Block 99 · Studio A · %')::text
          || ' · ' || (body like '%refunded KES 10,000%')::text
          || ' · ' || (body like '%share of KES 8,500 is no longer owed%')::text
          || ' · ' || (body like '%receipt RCT-%no longer applies%')::text
     from public.notification_outbox
    where template = 'host_booking_cancelled' and recipient = 'host99n@example.test'),
  'true · true · true · true',
  'A booking NexG cancels is emailed to the host: the refund, the share no longer owed, the receipt');

/* Paid after its nights were taken: never confirmed, so the host never
   expected it and hears nothing. */
insert into public.stay (id, host_id, property_id, unit_id, check_in, check_out, source, status,
                         paid_kes, host_share_kes)
values ('d9960000-0000-4000-8000-00000000000a', 'd9910000-0000-4000-8000-00000000000a',
        'd9920000-0000-4000-8000-00000000000a', 'd9930000-0000-4000-8000-00000000000a',
        now() + interval '40 days', now() + interval '42 days', 'nexg', 'cancelled', 10000, 8500);
update public.stay set refund_due_at = now() where id = 'd9960000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.notification_outbox where template = 'host_booking_cancelled'),
  1,
  'A stay that was never confirmed sends the host nothing');

select ok(
  not has_function_privilege('authenticated', 'public.fn_receipt_for_host_payout(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.fn_receipt_for_host_payout(uuid, boolean)', 'execute'),
  'Nobody signed in can issue a payout receipt');

select * from finish();
rollback;
