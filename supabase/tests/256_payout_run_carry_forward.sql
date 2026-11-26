-- Payout-run carry-forward (20270334000100): money a week's run does not pay
-- is carried to a later run exactly once. Under the minimum, below zero, held
-- and cancelled all come back; nothing is claimed twice; and a host invoice's
-- receipt is in cents.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* A KES 1,000 minimum payout, everywhere. */
insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('settlement.minimum_payout', 'settlement', 'global', 'money', 'KES', 'Minimum payout')
on conflict (key) do nothing;
delete from settings.version where key = 'settlement.minimum_payout';
insert into settings.version (key, scope_kind, value, status, effective_from, reason)
values ('settlement.minimum_payout', 'global', to_jsonb(1000), 'active',
        now() - interval '1 minute', 'test 256');

/* Three weeks: two finished and the current one. Any run this database has
   for them is set aside for the test. */
insert into t values
  ('w1', (date_trunc('week', (now() at time zone 'Africa/Nairobi') - interval '14 days')
            at time zone 'Africa/Nairobi')::text);
insert into t values
  ('w2', ((select v::timestamptz from t where k = 'w1') + interval '7 days')::text),
  ('w3', ((select v::timestamptz from t where k = 'w1') + interval '14 days')::text),
  ('w4', ((select v::timestamptz from t where k = 'w1') + interval '21 days')::text);
delete from public.fin_settlement_run
 where period_start in (select v::timestamptz from t where k in ('w1', 'w2', 'w3'));

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c2560000-0000-4000-8000-0000000000a1',
        'authenticated', 'authenticated', 'lead.256@test.local', '', now(), now(), now());
insert into public.staff_user (id, user_id, email, display_name)
values ('c2560000-0000-4000-8000-0000000000b1', 'c2560000-0000-4000-8000-0000000000a1',
        'lead.256@test.local', 'Finance 256');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2560000-0000-4000-8000-0000000000b1', r.id, null,
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
  from public.role r where r.key = 'finance';

/* U earns under the minimum, N is clawed back below zero, K has no payout
   details yet. U and N have verified details. */
insert into public.host (id, display_name, contact_name, email, phone, city_id, status, verified_at, went_live_at)
select h.id, h.name, h.name, h.email, h.phone, c.id, 'live', now(), now()
from (values
  ('c2560000-0000-4000-8000-0000000000c1'::uuid, '[Host 256 Under]', 'under256@example.test', '+254700025601'),
  ('c2560000-0000-4000-8000-0000000000c2'::uuid, '[Host 256 Negative]', 'neg256@example.test', '+254700025602'),
  ('c2560000-0000-4000-8000-0000000000c3'::uuid, '[Host 256 Held]', 'held256@example.test', '+254700025603')
) as h (id, name, email, phone)
cross join (select id from public.city where slug = 'nairobi') c;

insert into public.host_payout (host_id, rail, account)
select h, 'mpesa_phone', '{"phoneNumber": "+254712345678", "accountName": "Test Host"}'::jsonb
  from unnest(array['c2560000-0000-4000-8000-0000000000c1',
                    'c2560000-0000-4000-8000-0000000000c2']::uuid[]) h;
update public.host_payout set verified_version = version, verified_at = now()
 where host_id in ('c2560000-0000-4000-8000-0000000000c1', 'c2560000-0000-4000-8000-0000000000c2');

/* Week 1: U earns KES 500 (under the minimum); N earns KES 1,000 and has
   KES 1,500 clawed back; K earns KES 3,000. Week 2: U earns KES 800 more,
   N KES 2,000. */
create function pg_temp.share(p_key text, p_host uuid, p_cents bigint, p_at timestamptz)
returns void language plpgsql as $$
begin
  perform ledger.post('stay_paid', p_key, jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill',
                       case when p_cents > 0 then 'debit' else 'credit' end, abs(p_cents)),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host', 'party_id', p_host,
                       case when p_cents > 0 then 'credit' else 'debit' end, abs(p_cents))),
    p_effective_at => p_at);
end
$$;
select pg_temp.share('tap:256:u1', 'c2560000-0000-4000-8000-0000000000c1', 50000,
                     (select v::timestamptz from t where k = 'w1') + interval '2 days');
select pg_temp.share('tap:256:n1', 'c2560000-0000-4000-8000-0000000000c2', 100000,
                     (select v::timestamptz from t where k = 'w1') + interval '2 days');
select pg_temp.share('tap:256:n1b', 'c2560000-0000-4000-8000-0000000000c2', -150000,
                     (select v::timestamptz from t where k = 'w1') + interval '3 days');
select pg_temp.share('tap:256:k1', 'c2560000-0000-4000-8000-0000000000c3', 300000,
                     (select v::timestamptz from t where k = 'w1') + interval '2 days');
select pg_temp.share('tap:256:u2', 'c2560000-0000-4000-8000-0000000000c1', 80000,
                     (select v::timestamptz from t where k = 'w2') + interval '2 days');
select pg_temp.share('tap:256:n2', 'c2560000-0000-4000-8000-0000000000c2', 200000,
                     (select v::timestamptz from t where k = 'w2') + interval '2 days');

create function pg_temp.build(p_from text, p_to text) returns uuid language sql as $$
  select (public.rpc_settlement_build((select v::timestamptz from t where k = p_from),
                                      (select v::timestamptz from t where k = p_to)) ->> 'run_id')::uuid
$$;
create function pg_temp.line(p_run uuid, p_host uuid) returns jsonb language sql as $$
  select jsonb_build_object('gross', gross_cents, 'net', net_cents, 'state', state)
    from public.fin_settlement_line where run_id = p_run and party_id = p_host
$$;
create function pg_temp.move(p_run uuid, p_to public.settlement_state) returns void language plpgsql as $$
begin
  perform set_config('nexg.settlement_transition', p_run::text, true);
  update public.fin_settlement_run set state = p_to where id = p_run;
  perform set_config('nexg.settlement_transition', '', true);
end
$$;
create function pg_temp.claims(p_host uuid) returns integer language sql as $$
  select count(*)::int from public.fin_settled_entry s
    join public.fin_settlement_line l on l.id = s.line_id where l.party_id = p_host
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2560000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- ══════════════════════════════════════════ week 1, built, cancelled, rebuilt

insert into t select 'run1a', pg_temp.build('w1', 'w2')::text;
reset role;
select is(pg_temp.claims('c2560000-0000-4000-8000-0000000000c3'), 1,
  'Week 1: the held host''s line claims its entry while the run is open');
select pg_temp.move((select v::uuid from t where k = 'run1a'), 'cancelled');
select is((select count(*)::int from public.fin_settled_entry
            where run_id = (select v::uuid from t where k = 'run1a')), 0,
  'A cancelled run gives back every claim');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2560000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t select 'run1', pg_temp.build('w1', 'w2')::text;
reset role;

select is(pg_temp.line((select v::uuid from t where k = 'run1'), 'c2560000-0000-4000-8000-0000000000c3'),
  '{"gross": 300000, "net": 300000, "state": "held_kyc"}'::jsonb,
  'so the week is built again with its money: the host without payout details is held');
select is((select reference from public.fin_settlement_run where id = (select v::uuid from t where k = 'run1')),
  (select reference || '-2' from public.fin_settlement_run where id = (select v::uuid from t where k = 'run1a')),
  'The rebuilt week is RUN-…-2; the cancelled run keeps its reference');
select is(pg_temp.line((select v::uuid from t where k = 'run1'), 'c2560000-0000-4000-8000-0000000000c1'),
  null, 'Under the minimum there is no line');
select is(pg_temp.line((select v::uuid from t where k = 'run1'), 'c2560000-0000-4000-8000-0000000000c2'),
  null, 'Below zero there is no line either');
select is(pg_temp.claims('c2560000-0000-4000-8000-0000000000c1')
          + pg_temp.claims('c2560000-0000-4000-8000-0000000000c2'), 0,
  'and neither claims its entries');

-- ═════════════════════════════════════ week 1 paid out, the hold given back

select pg_temp.move((select v::uuid from t where k = 'run1'), 'approved_2');
select is(pg_temp.claims('c2560000-0000-4000-8000-0000000000c3'), 1,
  'Up to the second signature the held line keeps its claim');
select pg_temp.move((select v::uuid from t where k = 'run1'), 'files_generated');
select is(pg_temp.claims('c2560000-0000-4000-8000-0000000000c3'), 0,
  'Once the payment files are made the held line gives its claim back');
select is(pg_temp.line((select v::uuid from t where k = 'run1'), 'c2560000-0000-4000-8000-0000000000c3'),
  '{"gross": 300000, "net": 300000, "state": "held_kyc"}'::jsonb,
  'and the line itself is unchanged');
select public.fn_settlement_recompute((select v::uuid from t where k = 'run1'));
select ok((select bool_and((c ->> 'ok')::boolean) from public.fin_settlement_run r,
                jsonb_array_elements(r.checks) c
            where r.id = (select v::uuid from t where k = 'run1')
              and c ->> 'key' in ('ledger_equality', 'no_double_settlement', 'nothing_negative')),
  'The run''s ledger checks still pass');

/* The host's details are verified meanwhile. */
insert into public.host_payout (host_id, rail, account)
select 'c2560000-0000-4000-8000-0000000000c3', 'mpesa_phone',
       '{"phoneNumber": "+254712345679", "accountName": "Held Host"}'::jsonb;
update public.host_payout set verified_version = version, verified_at = now()
 where host_id = 'c2560000-0000-4000-8000-0000000000c3';

-- ═════════════════════════════════════════════ week 2 picks it all up

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2560000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t select 'run2', pg_temp.build('w2', 'w3')::text;
reset role;

select is(pg_temp.line((select v::uuid from t where k = 'run2'), 'c2560000-0000-4000-8000-0000000000c1'),
  '{"gross": 130000, "net": 130000, "state": "ready"}'::jsonb,
  'Week 2 pays the KES 500 that rolled with the KES 800 earned since');
select is(pg_temp.line((select v::uuid from t where k = 'run2'), 'c2560000-0000-4000-8000-0000000000c2'),
  '{"gross": 150000, "net": 150000, "state": "ready"}'::jsonb,
  'The KES 500 still owed back comes off the next positive week');
select is(pg_temp.line((select v::uuid from t where k = 'run2'), 'c2560000-0000-4000-8000-0000000000c3'),
  '{"gross": 300000, "net": 300000, "state": "ready"}'::jsonb,
  'The held KES 3,000 is paid once the hold lifts');
select is(pg_temp.claims('c2560000-0000-4000-8000-0000000000c1') * 100
          + pg_temp.claims('c2560000-0000-4000-8000-0000000000c2') * 10
          + pg_temp.claims('c2560000-0000-4000-8000-0000000000c3'), 231,
  'Week 2 claims every carried entry: 2 for U, 3 for N, 1 for K');
select is((select sum(gross_cents)::bigint from public.fin_settlement_line l
            where l.party_type = 'host' and l.party_id in ('c2560000-0000-4000-8000-0000000000c1',
              'c2560000-0000-4000-8000-0000000000c2', 'c2560000-0000-4000-8000-0000000000c3')
              and l.state = 'ready'),
  580000::bigint, 'Paid in all: exactly what the three earned, net of the clawback');

-- ═════════════════════════════════════════════ and never again

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2560000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t select 'run3', pg_temp.build('w3', 'w4')::text;
reset role;
select is((select count(*)::int from public.fin_settlement_line
            where run_id = (select v::uuid from t where k = 'run3')
              and party_id in ('c2560000-0000-4000-8000-0000000000c1',
                               'c2560000-0000-4000-8000-0000000000c2', 'c2560000-0000-4000-8000-0000000000c3')),
  0, 'Week 3 has nothing for them: carried exactly once');

-- ═════════════════════════════════════════════ a host invoice receipt

insert into public.host_invoice (id, host_id, period, lines, subtotal, total, status, due_at)
values ('c2560000-0000-4000-8000-0000000000e1', 'c2560000-0000-4000-8000-0000000000c1',
        date '2025-12-01', '[{"label": "Listing boost", "amount": 450000}]'::jsonb,
        450000, 450000, 'sent', date '2025-12-15');
update public.host_invoice set status = 'paid', paid_at = now(), provider_ref = 'TAP256'
 where id = 'c2560000-0000-4000-8000-0000000000e1';

select is(
  (select r.total_cents || ':' || (r.lines #>> '{0,amount_cents}') from public.receipt r
    where r.source_type = 'host_invoice' and r.source_id = 'c2560000-0000-4000-8000-0000000000e1'),
  '450000:450000',
  'A host invoice''s receipt is in cents: KES 4,500, not KES 450,000');

select is(
  (select count(*)::int from (select entry_id from public.fin_settled_entry group by entry_id
                               having count(*) > 1) d), 0,
  'No ledger entry is claimed twice');

select * from finish();
rollback;
