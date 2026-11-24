-- Payout rules, riders: the rules screen lists them, early cash-out can be
-- switched off, and riders roll below their own minimum in the payout run.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1250000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider125@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1250000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'finance125@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1250000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver125@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1250000-0000-4000-8000-0000000000b1', 'c1250000-0000-4000-8000-000000000006', 'finance125@test.local', 'Finance 125'),
  ('c1250000-0000-4000-8000-0000000000b2', 'c1250000-0000-4000-8000-000000000007', 'approver125@test.local', 'Approver 125');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1250000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1250000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'finance';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, payout_msisdn)
values ('c1250000-0000-4000-8000-000000000031', 'c1250000-0000-4000-8000-000000000003',
        '[Rider]', '[125]', '+254700012502', (select id from public.city where slug = 'nairobi'),
        'motorbike', '[PLATE125]', 'active', 'offline', now(), '+254700012502');

-- Earned 900 and holding no cash, so the run line is "ready".
insert into public.rider_earning (rider_id, order_reference, base_kes, total_kes, earned_at)
values ('c1250000-0000-4000-8000-000000000031', '[RULES-125-1]', 500, 500, now()),
       ('c1250000-0000-4000-8000-000000000031', '[RULES-125-2]', 400, 400, now());
/* What the run pays comes from the ledger: the same 900 owed to the rider
   (earnings without a real order post nothing there). */
select ledger.post(
  p_kind => 'rider_pay_recognised',
  p_idempotency_key => 'rider_pay:[RULES-125]',
  p_entries => jsonb_build_array(
    jsonb_build_object('account', 'expense.rider_pay', 'debit', 90000),
    jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
      'party_id', 'c1250000-0000-4000-8000-000000000031', 'credit', 90000, 'memo', '[RULES-125]')),
  p_city_id => (select id from public.city where slug = 'nairobi'),
  p_actor_label => '[Test]');

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
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

/* A rule made live for Nairobi, as an approved change would be. */
create function pg_temp.rule(p_key text, p_value jsonb) returns void language sql as $$
  update settings.version set status = 'superseded', superseded_at = now()
   where key = p_key and status = 'active'
     and scope_city_id = (select id from public.city where slug = 'nairobi');
  insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, activated_at, reason)
  values (p_key, 'city', (select id from public.city where slug = 'nairobi'), p_value, 'active',
          now() - interval '1 minute', now() - interval '1 minute', '[payout rules test]');
$$;

create function pg_temp.rider_line() returns text language sql as $$
  select coalesce((select state::text || ' · ' || net_cents
     from public.fin_settlement_line
    where party_id = 'c1250000-0000-4000-8000-000000000031'
    limit 1), 'no line')
$$;

-- ── the screen

select is(
  (select array_agg(key order by sort) from (select distinct key, sort from public.payout_rules_v
                                              where party = 'rider'
                                                and key in ('payouts.rider.minimum_kes', 'payouts.rider.early_cashout',
                                                            'payments.rider_early_payout_min_kes')) x),
  array['payouts.rider.minimum_kes', 'payouts.rider.early_cashout',
        'payments.rider_early_payout_min_kes'],
  'The Payout rules screen lists the riders'' rules in order.');
select is(
  (select value from public.payout_rules_v
    where key = 'payouts.rider.early_cashout'
      and city_id = (select id from public.city where slug = 'nairobi')),
  'true'::jsonb,
  'Early cash-out is on unless Finance turns it off.');

-- ── early cash-out switched off

select pg_temp.rule('payouts.rider.early_cashout', 'false'::jsonb);

set local role authenticated;
select pg_temp.as_user('c1250000-0000-4000-8000-000000000003');
select is((public.rpc_rider_payout_overview() ->> 'earlyCashout')::boolean, false,
  'The rider''s earnings page is told early cash-out is off.');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(500)$$), 'early_cashout_off',
  'and asking to be paid early is refused.');
reset role;

select pg_temp.rule('payouts.rider.early_cashout', 'true'::jsonb);
set local role authenticated;
select pg_temp.as_user('c1250000-0000-4000-8000-000000000003');
select is(public.rpc_rider_payout_request(500) ->> 'status', 'pending',
  'Turned back on, the rider can ask again.');
reset role;

-- ── riders' own minimum in the payout run

select pg_temp.rule('payouts.rider.minimum_kes', '5000'::jsonb);

set local role authenticated;
select pg_temp.as_user('c1250000-0000-4000-8000-000000000006');
select lives_ok($$select public.rpc_settlement_build(now() - interval '1 hour', now() + interval '1 hour')$$,
  'Finance builds the run.');
reset role;
select is(pg_temp.rider_line(), 'no line',
  'Owed KES 900 under a riders'' minimum of KES 5,000: the rider rolls to the next run.');

select pg_temp.rule('payouts.rider.minimum_kes', '100'::jsonb);
set local role authenticated;
select pg_temp.as_user('c1250000-0000-4000-8000-000000000006');
select public.rpc_settlement_build(now() - interval '1 hour', now() + interval '1 hour');
reset role;
select is(pg_temp.rider_line(), 'ready · 90000',
  'With a minimum of KES 100, the rider is in the run for KES 900.');

select * from finish();
rollback;
