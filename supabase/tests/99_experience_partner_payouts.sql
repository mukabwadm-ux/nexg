-- Experience partners are paid in the weekly run.
--
-- A plan marked paid puts the quote total in cash and holds it on
-- deferred.experience_plan; a block marked done owes its partner its price;
-- a completed plan books the concierge fee net of VAT. The run names each
-- partner, pays only to details Finance verified, and holds the rest.
-- Declaring and verifying payout details are two different people.

begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* The same rates everywhere this file runs. */
delete from settings.version where key in ('tax.vat_pct', 'settlement.minimum_payout');
insert into settings.version (key, scope_kind, value, status, effective_from, activated_at)
values ('tax.vat_pct', 'global', '16'::jsonb, 'active', now(), now());

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('a7a70000-0000-4000-8000-0000000000a1'::uuid, 'fin.one.xpp@test.local'),
  ('a7a70000-0000-4000-8000-0000000000a2'::uuid, 'fin.two.xpp@test.local'),
  ('a7a70000-0000-4000-8000-0000000000a3'::uuid, 'lead.xpp@test.local'),
  ('a7a70000-0000-4000-8000-0000000000a4'::uuid, 'both.xpp@test.local'),
  ('a7a70000-0000-4000-8000-0000000000a5'::uuid, 'riders.xpp@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('a7a70000-0000-4000-8000-0000000000b1', 'a7a70000-0000-4000-8000-0000000000a1', 'fin.one.xpp@test.local', 'Finance One XPP'),
  ('a7a70000-0000-4000-8000-0000000000b2', 'a7a70000-0000-4000-8000-0000000000a2', 'fin.two.xpp@test.local', 'Finance Two XPP'),
  ('a7a70000-0000-4000-8000-0000000000b3', 'a7a70000-0000-4000-8000-0000000000a3', 'lead.xpp@test.local', 'Concierge Lead XPP'),
  ('a7a70000-0000-4000-8000-0000000000b4', 'a7a70000-0000-4000-8000-0000000000a4', 'both.xpp@test.local', 'Finance And Growth XPP'),
  ('a7a70000-0000-4000-8000-0000000000b5', 'a7a70000-0000-4000-8000-0000000000a5', 'riders.xpp@test.local', 'Rider Ops XPP');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, g.city_id, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('a7a70000-0000-4000-8000-0000000000b1'::uuid, 'finance', null::uuid),
  ('a7a70000-0000-4000-8000-0000000000b2'::uuid, 'finance', null::uuid),
  ('a7a70000-0000-4000-8000-0000000000b3'::uuid, 'concierge_lead',
     (select id from public.city where slug = 'nairobi')),
  ('a7a70000-0000-4000-8000-0000000000b4'::uuid, 'finance', null::uuid),
  ('a7a70000-0000-4000-8000-0000000000b4'::uuid, 'growth', null::uuid),
  ('a7a70000-0000-4000-8000-0000000000b5'::uuid, 'rider_ops', null::uuid)
) as g (staff_id, role_key, city_id)
join public.role r on r.key = g.role_key;

-- --------------------------------------------------------------- catalogue

insert into public.experience_partner (id, name, kind, city_id, contact_phone, status, went_live_at)
select p.id, p.name, p.kind::public.experience_partner_kind, c.id, p.phone,
       p.status::public.partner_status, case when p.status = 'live' then now() end
from (values
  ('a7a70000-0000-4000-8000-0000000000c1'::uuid, 'Test Venue XPP', 'venue', '+254700100001', 'live'),
  ('a7a70000-0000-4000-8000-0000000000c2'::uuid, 'Test Operator XPP', 'operator', '+254700100002', 'suspended'),
  ('a7a70000-0000-4000-8000-0000000000c3'::uuid, 'Test Drivers XPP', 'driver', '+254700100003', 'live')
) as p (id, name, kind, phone, status)
cross join (select id from public.city where slug = 'nairobi') c;

insert into public.experience_component
  (id, partner_id, city_id, kind, mood, title, duration_min, default_slot, swap_group)
select k.id, k.partner_id, c.id, k.kind::public.block_kind, 'wild', k.title, 120, 'morning', 'xpp_test'
from (values
  ('a7a70000-0000-4000-8000-0000000000d1'::uuid, 'a7a70000-0000-4000-8000-0000000000c1'::uuid,
   'activity', 'Venue visit'),
  ('a7a70000-0000-4000-8000-0000000000d2'::uuid, 'a7a70000-0000-4000-8000-0000000000c2'::uuid,
   'activity', 'Operator tour'),
  ('a7a70000-0000-4000-8000-0000000000d3'::uuid, 'a7a70000-0000-4000-8000-0000000000c3'::uuid,
   'transport', 'Drive')
) as k (id, partner_id, kind, title)
cross join (select id from public.city where slug = 'nairobi') c;

-- -------------------------------------------------------------------- plans

/*
 * A: approved, 22,320 = 12,000 + 5,000 + 3,000 + 0 + a 2,320 fee. The
 *    included ride home and the unavailable late show are not in the total.
 * B: approved, one 1,500 block, paid by bank.
 * C: paid before payments were posted to the ledger.
 * D: approved, paid by a caller that names only the reference.
 */
insert into public.plan (id, city_id, guest_name, guest_phone, status, concierge_id,
                         quote_total_kes, concierge_fee_kes, quoted_at, approved_at,
                         paid_at, payment_reference)
select p.id, c.id, p.guest, '+254722000999', p.status::public.plan_status,
       'a7a70000-0000-4000-8000-0000000000b3', p.total, p.fee, now(), now(),
       case when p.status = 'paid' then now() end,
       case when p.status = 'paid' then 'OLD-REF-C' end
from (values
  ('a7a70000-0000-4000-8000-0000000000e1'::uuid, 'Guest A', 'approved', 22320, 2320),
  ('a7a70000-0000-4000-8000-0000000000e2'::uuid, 'Guest B', 'approved', 1500, 0),
  ('a7a70000-0000-4000-8000-0000000000e3'::uuid, 'Guest C', 'paid', 1000, 0),
  ('a7a70000-0000-4000-8000-0000000000e4'::uuid, 'Guest D', 'approved', 800, 0)
) as p (id, guest, status, total, fee)
cross join (select id from public.city where slug = 'nairobi') c;

insert into public.plan_block (id, plan_id, slot, kind, component_id, title_snapshot,
                               price_quoted_kes, status, change_note)
values
  ('a7a70000-0000-4000-8000-0000000000f1', 'a7a70000-0000-4000-8000-0000000000e1', 'morning',
   'activity', 'a7a70000-0000-4000-8000-0000000000d1', 'Venue visit', 12000, 'confirmed', null),
  ('a7a70000-0000-4000-8000-0000000000f2', 'a7a70000-0000-4000-8000-0000000000e1', 'afternoon',
   'activity', 'a7a70000-0000-4000-8000-0000000000d2', 'Operator tour', 5000, 'confirmed', null),
  ('a7a70000-0000-4000-8000-0000000000f3', 'a7a70000-0000-4000-8000-0000000000e1', 'evening',
   'transport', 'a7a70000-0000-4000-8000-0000000000d3', 'Drive', 3000, 'changed', 'Later pick-up'),
  ('a7a70000-0000-4000-8000-0000000000f5', 'a7a70000-0000-4000-8000-0000000000e1', 'midday',
   'meal', 'a7a70000-0000-4000-8000-0000000000d1', 'Snack on the house', 0, 'confirmed', null),
  ('a7a70000-0000-4000-8000-0000000000f6', 'a7a70000-0000-4000-8000-0000000000e1', 'late',
   'activity', 'a7a70000-0000-4000-8000-0000000000d1', 'Late show', 4000, 'unavailable', 'Closed tonight'),
  ('a7a70000-0000-4000-8000-0000000000f7', 'a7a70000-0000-4000-8000-0000000000e3', 'morning',
   'activity', 'a7a70000-0000-4000-8000-0000000000d1', 'Old visit', 1000, 'confirmed', null),
  ('a7a70000-0000-4000-8000-0000000000f8', 'a7a70000-0000-4000-8000-0000000000e2', 'morning',
   'activity', 'a7a70000-0000-4000-8000-0000000000d1', 'Venue visit', 1500, 'confirmed', null);

insert into public.plan_block (id, plan_id, slot, kind, component_id, title_snapshot,
                               price_quoted_kes, status, included_by)
values ('a7a70000-0000-4000-8000-0000000000f4', 'a7a70000-0000-4000-8000-0000000000e1', 'night',
        'transport', 'a7a70000-0000-4000-8000-0000000000d3', 'Ride home', 2000, 'confirmed',
        'a7a70000-0000-4000-8000-0000000000f1');

/* A run window around now, which is when everything below happens. Any run
   this database already has for the week is set aside for the test. */
insert into t values
  ('from', (now() - interval '1 hour')::text),
  ('to', (now() + interval '1 hour')::text);
delete from public.fin_settlement_run
 where reference = 'RUN-' || to_char(now() - interval '1 hour', 'IYYY-"W"IW')
    or (period_start = now() - interval '1 hour' and period_end = now() + interval '1 hour');

-- ═══════════════════════════════════════════════════════════════ wiring

select ok(
  not has_function_privilege('anon', 'public.rpc_mark_paid(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_experience_partner_payout_declare(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_experience_partner_payout_verify(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_experience_partner_payouts()', 'execute')
  and not has_function_privilege('anon', 'authz.works_experiences()', 'execute'),
  'Signed-out visitors can call none of the new functions');

select ok(
  not has_function_privilege('authenticated', 'ledger.fn_post_plan_paid(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'ledger.fn_post_plan_block_partner(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'ledger.fn_post_plan_fee(uuid)', 'execute')
  and not has_function_privilege('anon', 'ledger.fn_post_plan_paid(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'ledger.fn_post_plan_block_partner(uuid)', 'execute')
  and not has_function_privilege('anon', 'ledger.fn_post_plan_fee(uuid)', 'execute'),
  'Nobody signed in or out posts plan money directly');

select ok(
  to_regprocedure('public.rpc_mark_paid(uuid, text)') is null,
  'The two-argument mark-paid is gone, so a call naming two arguments is not ambiguous');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ~* '(rpc_mark_paid|partner_payout|plan_block_posts|plan_posts|settlement_build|fn_settlement_recompute|fn_fin_build_party_owed)'),
  0,
  'The wiring check finds nothing wrong with any of it');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''((?:partner|finance)\.(?:partner_)?payout_[a-z_]+)''', 'g') as m
     where p.proname in ('rpc_experience_partner_payout_declare', 'rpc_experience_partner_payout_verify')) used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action the payout functions log is in the audit registry');

select is(
  (select count(*)::int from audit.action_registry
    where money and action in ('partner.payout_declared', 'finance.partner_payout_verified',
                               'finance.partner_payout_self_verified')),
  3,
  'Declaring, verifying and a super admin verifying their own are registered as money actions');

select is(
  (select c.relrowsecurity::text || ' ' || (select count(*) from pg_policies p
                                              where p.schemaname = 'public'
                                                and p.tablename = 'experience_partner_payout')::text
     from pg_class c where c.oid = 'public.experience_partner_payout'::regclass),
  'true 0',
  'Payout details sit behind row-level security with no policy: closed');

-- ═════════════════════════════════════════════════════ marking plans paid

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_mark_paid('a7a70000-0000-4000-8000-0000000000e1', 'MPESA-XPP-A', 'cheque')$$,
  '22023', 'Say how the guest paid, by M-PESA or by bank.',
  'A plan is paid by M-PESA or by bank, nothing else');

select lives_ok(
  $$select public.rpc_mark_paid('a7a70000-0000-4000-8000-0000000000e1', 'MPESA-XPP-A', 'mpesa')$$,
  'The desk records plan A paid by M-PESA');

select lives_ok(
  $$select public.rpc_mark_paid('a7a70000-0000-4000-8000-0000000000e2', 'FT-XPP-B', 'bank')$$,
  'and plan B paid by bank');

select lives_ok(
  $$select public.rpc_mark_paid(p_plan_id => 'a7a70000-0000-4000-8000-0000000000e4', p_reference => 'MPESA-XPP-D')$$,
  'and plan D by a caller that names only the reference, as the console did');

reset role;

select is(
  (select jsonb_object_agg(e.account_code, jsonb_build_array(e.debit, e.credit))
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_paid:a7a70000-0000-4000-8000-0000000000e1'),
  '{"cash.mpesa_paybill": [2232000, 0], "deferred.experience_plan": [0, 2232000]}'::jsonb,
  'Paid by M-PESA: the quote total, in cents, lands on the paybill and waits on deferred');

select is(
  (select e.account_code || ' ' || e.debit
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_paid:a7a70000-0000-4000-8000-0000000000e2' and e.debit > 0),
  'cash.bank 150000',
  'Paid by bank: it lands on the bank account');

select is(
  (select e.account_code
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_paid:a7a70000-0000-4000-8000-0000000000e4' and e.debit > 0),
  'cash.mpesa_paybill',
  'Without a method it is M-PESA, as before');

select is(
  (select status::text || ' · ' || payment_reference from public.plan
    where id = 'a7a70000-0000-4000-8000-0000000000e1'),
  'paid · MPESA-XPP-A',
  'The plan itself is paid under its reference, as before');

-- ═══════════════════════════════════════════════════════ blocks marked done

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_block_done(b.id::uuid) from (values
      ('a7a70000-0000-4000-8000-0000000000f1'), ('a7a70000-0000-4000-8000-0000000000f2'),
      ('a7a70000-0000-4000-8000-0000000000f3'), ('a7a70000-0000-4000-8000-0000000000f4'),
      ('a7a70000-0000-4000-8000-0000000000f5'), ('a7a70000-0000-4000-8000-0000000000f6'),
      ('a7a70000-0000-4000-8000-0000000000f7')) as b (id)$$,
  'The desk marks every block of plans A and C done');

/* Straight on the table, as the desk's row policy allows. */
select lives_ok(
  $$update public.plan_block set status = 'done', done_at = now()
     where id = 'a7a70000-0000-4000-8000-0000000000f8'$$,
  'and plan B''s block done with a plain update');

reset role;

select is(
  (select count(*)::int from ledger.transaction
    where idempotency_key like 'plan_block_partner:%'
      and related ->> 'plan_id' = 'a7a70000-0000-4000-8000-0000000000e1'),
  3,
  'Three of plan A''s blocks were priced by the quote and done: three postings');

select is(
  (select jsonb_object_agg(e.account_code, jsonb_build_array(e.debit, e.credit))
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_block_partner:a7a70000-0000-4000-8000-0000000000f1'),
  '{"deferred.experience_plan": [1200000, 0], "payable.experience_partner:a7a70000-0000-4000-8000-0000000000c1": [0, 1200000]}'::jsonb,
  'The venue is owed its block in full, out of what the guest paid: KES 12,000');

select is(
  (select count(*)::int from ledger.transaction
    where idempotency_key in (
      'plan_block_partner:a7a70000-0000-4000-8000-0000000000f4',
      'plan_block_partner:a7a70000-0000-4000-8000-0000000000f5',
      'plan_block_partner:a7a70000-0000-4000-8000-0000000000f6')),
  0,
  'Nothing for a block another includes, one priced at nothing, or one that was unavailable');

select is(
  ledger.fn_post_plan_block_partner('a7a70000-0000-4000-8000-0000000000f1'),
  (select id from ledger.transaction
    where idempotency_key = 'plan_block_partner:a7a70000-0000-4000-8000-0000000000f1'),
  'Posting a done block again hands back the same transaction');

select is(
  (select count(*)::int from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_block_partner:a7a70000-0000-4000-8000-0000000000f1'),
  2,
  'and still two entries, not four');

select is(
  (select count(*)::int from ledger.transaction
    where idempotency_key = 'plan_block_partner:a7a70000-0000-4000-8000-0000000000f8'),
  1,
  'A block marked done with a plain update posts too: the trigger is the wiring');

select is(
  (select count(*)::int from ledger.transaction
    where related ->> 'plan_id' = 'a7a70000-0000-4000-8000-0000000000e3'),
  0,
  'A plan paid before payments were posted owes nothing through the ledger when its block is done');

-- ══════════════════════════════════════ owed, before any run claims it

do $$ begin perform public.fn_fin_build_party_owed(); end $$;

select is(
  (select label || ' · ' || owed_cents from public.fin_party_owed
    where party_type = 'experience_partner' and party_id = 'a7a70000-0000-4000-8000-0000000000c1'),
  'Test Venue XPP · 1350000',
  'The venue is on the owed list under its name, for both plans');

-- ═══════════════════════════════════════════════════════ closing the day

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_complete_plan('a7a70000-0000-4000-8000-0000000000e1')$$,
  'Plan A is completed');

select lives_ok(
  $$select public.rpc_complete_plan('a7a70000-0000-4000-8000-0000000000e3')$$,
  'and so is plan C');

reset role;

select is(
  (select jsonb_object_agg(e.account_code, jsonb_build_array(e.debit, e.credit))
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'plan_fee:a7a70000-0000-4000-8000-0000000000e1'),
  '{"deferred.experience_plan": [232000, 0], "revenue.concierge_fee": [0, 200000], "tax.vat_output": [0, 32000]}'::jsonb,
  'The KES 2,320 fee is NexG''s: 2,000 revenue and 320 VAT at 16%');

select is(
  (select coalesce(sum(e.credit - e.debit), 0)::bigint
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where e.account_code = 'deferred.experience_plan'
      and tx.related ->> 'plan_id' = 'a7a70000-0000-4000-8000-0000000000e1'),
  0::bigint,
  'With every priced block done and the day closed, nothing of plan A is left on deferred');

select is(
  (select count(*)::int from ledger.transaction
    where idempotency_key = 'plan_fee:a7a70000-0000-4000-8000-0000000000e3'),
  0,
  'Closing a plan paid before payments were posted books no fee');

select is(
  (select count(*)::int from (
     select tx.id from ledger.transaction tx join ledger.entry e on e.transaction_id = tx.id
      where tx.related ->> 'plan_id' like 'a7a70000-%'
      group by tx.id having sum(e.debit) <> sum(e.credit)) x),
  0,
  'Every plan posting balances');

select is(
  (select count(*)::int from (
     select e.transaction_id from ledger.entry e
      group by e.transaction_id having sum(e.debit) <> sum(e.credit)) x),
  0,
  'and so does the whole ledger');

-- ═══════════════════════════════════════════════════ declaring payout details

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_till","tillNumber":"5123456"}')$$,
  '42501', 'Only people who work the Experiences module can declare payout details.',
  'Someone outside Experiences cannot declare where a partner is paid');

select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_till","tillNumber":"5123456"}')$$,
  '42501', 'Only people who work the Experiences module can declare payout details.',
  'nor can Finance, who verify them');

select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_till"}')$$,
  '22023', 'Fill in the fields for that payout method, and only those.',
  'A till needs its number');

select throws_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_till","tillNumber":"51-AB"}')$$,
  '22023', 'A till or paybill number is digits only.',
  'and the number is digits');

select throws_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c3',
      '{"rail":"mpesa_phone","phoneNumber":"12345","accountName":"Drivers Ltd"}')$$,
  '22023', 'Enter a Kenyan M-PESA number, such as 0712 345 678.',
  'An M-PESA number is a Kenyan mobile number');

select is(
  (public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_till","tillNumber":"5123456"}') ->> 'version'),
  '1',
  'Experiences staff declare the venue''s till');

select throws_ok(
  $$select * from public.experience_partner_payout$$,
  '42501', 'permission denied for table experience_partner_payout',
  'Nobody signed in reads the payout table directly');

reset role;

select is(
  (select after ->> 'destination' from audit.audit_event
    where action = 'partner.payout_declared'
      and target_id = 'a7a70000-0000-4000-8000-0000000000c1'
    order by id desc limit 1),
  'Till •••• 3456',
  'The audit log records the destination masked, not the number');

-- ═════════════════════════════════════════════ a run before anything is verified

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t (k, v) select 'run', public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to'))
  ->> 'run_id';

reset role;

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c1'),
  'Test Venue XPP · held_kyc · payout details not yet verified by Finance · 1350000',
  'The run names the partner and holds it while its details wait on Finance');

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c3'),
  'Test Drivers XPP · held_kyc · no payout details on file',
  'A partner with no details at all is held too');

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c2'),
  'Test Operator XPP · held_suspended · the partner is suspended · 500000',
  'A suspended partner is held, whatever their details');

select is(
  (select (totals ->> 'partners')::int || ' · ' || (totals ->> 'partners_cents')
     from public.fin_settlement_run where id = (select v::uuid from t where k = 'run')),
  '3 · 2150000',
  'The run totals the partners: three, KES 21,500');

select is(
  (select count(*)::int from public.fin_run_line_v
    where run_id = (select v::uuid from t where k = 'run') and not verifies),
  0,
  'Every line, partners included, re-sums to exactly the entries it claims');

-- ═══════════════════════════════════════════════════════════════ verifying

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c1', 1)$$,
  '42501', 'Only people with full Finance access can do this.',
  'Experiences staff cannot verify the details they declared');

select is(
  (select jsonb_build_object('masked', x ->> 'destination_masked', 'account', x -> 'account',
                             'verified', x -> 'verified')
     from jsonb_array_elements(public.rpc_experience_partner_payouts()) x
    where x ->> 'partner_id' = 'a7a70000-0000-4000-8000-0000000000c1'),
  '{"masked": "Till •••• 3456", "account": null, "verified": false}'::jsonb,
  'and see the destination masked, never the number');

select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select x -> 'account' ->> 'tillNumber'
     from jsonb_array_elements(public.rpc_experience_partner_payouts()) x
    where x ->> 'partner_id' = 'a7a70000-0000-4000-8000-0000000000c1'),
  '5123456',
  'Full Finance, who verify and pay, see the number itself');

select throws_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c1', 7)$$,
  '40001', 'The payout details changed after you opened them. Check the new details, then verify.',
  'Finance verifies the version they looked at, not a later one');

select lives_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c1', 1)$$,
  'Finance verifies the venue''s till');

select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c3',
      '{"rail":"mpesa_phone","phoneNumber":"0712 345 678","accountName":"Drivers Ltd"}')$$,
  'Someone with Finance and Growth declares the drivers'' M-PESA number');

select throws_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c3', 1)$$,
  '42501', 'Someone other than whoever declared these payout details has to verify them.',
  'and cannot verify it themselves');

select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c3', 1)$$,
  'A second person in Finance verifies it');

/* The seeded super admin. */
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c2',
      '{"rail":"bank","bankName":"Test Bank","accountName":"Operator Ltd","accountNumber":"0123-4567-8901"}')$$,
  'A super admin declares the operator''s bank account');

select lives_ok(
  $$select public.rpc_experience_partner_payout_verify('a7a70000-0000-4000-8000-0000000000c2', 1)$$,
  'and may verify it themselves');

reset role;

select is(
  (select count(*)::int from audit.audit_event
    where action = 'finance.partner_payout_self_verified'
      and target_id = 'a7a70000-0000-4000-8000-0000000000c2'),
  1,
  'and that is logged as their own, for review');

-- ═══════════════════════════════════════════════ the run, once verified

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_settlement_build(
      (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to'))$$,
  'Finance rebuilds the run');

reset role;

select is(
  (select state || ' · ' || rail || ' · ' || destination_masked || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c1'),
  'ready · mpesa_b2b · Till •••• 3456 · 1350000',
  'The venue is paid to its verified till');

select is(
  (select state || ' · ' || rail || ' · ' || destination_masked
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c3'),
  'ready · mpesa_b2c · •••• 5678',
  'The drivers to their verified M-PESA number');

select is(
  (select state || ' · ' || rail
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'a7a70000-0000-4000-8000-0000000000c2'),
  'held_suspended · bank_eft',
  'The suspended operator stays held, verified details or not');

-- ═══════════════════════════════════════════════ declaring again

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select is(
  (public.rpc_experience_partner_payout_declare('a7a70000-0000-4000-8000-0000000000c1',
      '{"rail":"mpesa_paybill","paybillNumber":"400200","accountReference":"ACC-778899"}')
   ->> 'destination_masked'),
  'Paybill 400200 · •••• 8899',
  'The venue moves to a paybill');

select is(
  (select (x ->> 'verified') || ' · ' || (x ->> 'version')
     from jsonb_array_elements(public.rpc_experience_partner_payouts()) x
    where x ->> 'partner_id' = 'a7a70000-0000-4000-8000-0000000000c1'),
  'false · 2',
  'Declaring again clears the verification, so the next run holds the venue until Finance checks it');

reset role;

-- ═════════════════════════════════════════ a run with no partners is unchanged

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7a70000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t (k, v) select 'empty', public.rpc_settlement_build(
  timestamptz '2001-01-01 00:00+03', timestamptz '2001-01-08 00:00+03') ->> 'run_id';

reset role;

select ok(
  (select not (totals ? 'partners_cents') and not (totals ? 'partners')
     from public.fin_settlement_run where id = (select v::uuid from t where k = 'empty')),
  'A run without partner lines carries no partner totals, so its totals and hash are as before');

select * from finish();
rollback;
