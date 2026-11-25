-- Finance, redesigned: Office finance (NexG's own spending) and the lists the Finance screens read.
--
-- Who reads and who records; two people for every approval (a super admin
-- approving their own is queued for review); nothing paid before it is
-- approved and nothing changed once paid; monthly budgets per category;
-- and a registered audit action for every change.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('96000000-0000-4000-8000-0000000000a1'::uuid, 'fin.one96@test.local'),
  ('96000000-0000-4000-8000-0000000000a2'::uuid, 'fin.two96@test.local'),
  ('96000000-0000-4000-8000-0000000000a3'::uuid, 'ops96@test.local'),
  ('96000000-0000-4000-8000-0000000000a4'::uuid, 'riders96@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('96000000-0000-4000-8000-0000000000b1', '96000000-0000-4000-8000-0000000000a1', 'fin.one96@test.local', 'Finance One 96'),
  ('96000000-0000-4000-8000-0000000000b2', '96000000-0000-4000-8000-0000000000a2', 'fin.two96@test.local', 'Finance Two 96'),
  ('96000000-0000-4000-8000-0000000000b3', '96000000-0000-4000-8000-0000000000a3', 'ops96@test.local', 'Ops 96'),
  ('96000000-0000-4000-8000-0000000000b4', '96000000-0000-4000-8000-0000000000a4', 'riders96@test.local', 'Riders 96');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('96000000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('96000000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
  ('96000000-0000-4000-8000-0000000000b3'::uuid, 'ops_manager'),
  ('96000000-0000-4000-8000-0000000000b4'::uuid, 'rider_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

/* Money the lists should find: a rider's float top-up, paid today, and a
   statement for a merchant the Finance role cannot read directly. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id)
values ('cccccccc-0000-4000-8000-000000000096', 'Test Grill 96 Limited', 'Test Grill 96',
        'restaurant', 'Owner 96', '+254712000960', 'owner96@shop.example',
        (select id from public.city where slug = 'nairobi'));

insert into public.merchant_statement (id, merchant_id, period_start, period_end, gross_kes,
                                       commission_kes, net_kes, status)
values ('96000000-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000096',
        current_date - 7, current_date - 1, 1500, 266, 1234, 'sent');

insert into public.payment (reference, intent, amount_cents, provider, provider_ref, channel, state,
                            paid_at, created_via, payer_phone)
values ('PAY-96-FLOAT', 'rider_float', 150000, 'mpesa', 'MPESA96FLOAT', 'mpesa', 'paid', now(),
        'rider_app', '+254700000961');

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('fin_office_expense', 'fin_office_budget')
      and c.relrowsecurity),
  2,
  'Both office finance tables have row-level security');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%office%'),
  0,
  'The wiring check finds nothing wrong with office finance');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(finance\.office_[a-z_]+)''', 'g') as m
     where p.proname like 'rpc\_office\_%') used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action an office finance function logs is in the audit registry');

select ok(
  not has_function_privilege('anon',
    'public.rpc_office_expense_save(date, text, text, bigint, text, uuid, uuid, text, text, uuid)', 'execute'),
  'Signed-out visitors cannot record expenses');

select is(
  (select public::text from storage.buckets where id = 'office-receipts'),
  'false',
  'Receipts are kept in a private bucket');

-- ---------------------------------------------------------------- recording

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t values ('rent', public.rpc_office_expense_save(
  current_date, 'Office rent – Test HQ 96', 'rent_utilities', 100000000, 'Test Landlord 96')::text);

select is(
  (select status || ' ' || (number like 'EXP-____-%')::text from public.fin_office_expense
    where id = (select v::uuid from t where k = 'rent')),
  'approved true',
  'Finance records an expense, numbered and recorded straight away');

select throws_ok(
  $$select public.rpc_office_expense_save(current_date + 2, 'Future rent', 'rent_utilities', 1000, 'Someone')$$,
  '22023', 'Enter the day it was spent, today or earlier.',
  'An expense cannot be dated in the future');

select throws_ok(
  $$select public.rpc_office_expense_decide((select v::uuid from t where k = 'rent'), true)$$,
  '23514', 'This expense is not waiting for a decision.',
  'Nobody has to approve it');

select throws_ok(
  $$select public.rpc_office_expense_pay((select v::uuid from t where k = 'rent'), 'mpesa')$$,
  '22023', 'Enter the M-Pesa or bank reference.',
  'An M-Pesa payment needs its reference');

-- ------------------------------------------------------- a colleague corrects it

select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_office_expense_decide((select v::uuid from t where k = 'rent'), false)$$,
  '23514', 'This expense is not waiting for a decision.',
  'Nor turn it down');

select lives_ok(
  $$select public.rpc_office_expense_save(current_date, 'Office rent – May – Test HQ 96', 'rent_utilities',
      100000000, 'Test Landlord 96', p_id => (select v::uuid from t where k = 'rent'))$$,
  'A colleague with full Finance can correct a recorded expense');

select is(
  (select status || ' ' || description from public.fin_office_expense
    where id = (select v::uuid from t where k = 'rent')),
  'approved Office rent – May – Test HQ 96',
  'and it stays recorded');

select lives_ok(
  $$select public.rpc_office_expense_pay((select v::uuid from t where k = 'rent'), 'bank_transfer', 'FT96RENT')$$,
  'and it is marked paid with the bank reference');

select is(
  (select status || ' ' || payment_method || ' ' || payment_reference || ' '
          || (paid_on = (now() at time zone 'Africa/Nairobi')::date)::text
     from public.fin_office_expense where id = (select v::uuid from t where k = 'rent')),
  'paid bank_transfer FT96RENT true',
  'The expense records how, when and with which reference it was paid');

select throws_ok(
  $$select public.rpc_office_expense_save(current_date, 'Office rent – changed', 'rent_utilities',
      50000000, 'Test Landlord 96', p_id => (select v::uuid from t where k = 'rent'))$$,
  '23514', 'A paid or cancelled expense stays as it is.',
  'A paid expense cannot be changed');

select throws_ok(
  $$select public.rpc_office_expense_cancel((select v::uuid from t where k = 'rent'), 'Mistake')$$,
  '23514', 'A paid or cancelled expense stays as it is.',
  'or cancelled');

/* One turned down under the old rule is fixed and recorded. */
insert into t values ('fuel', public.rpc_office_expense_save(
  current_date - 3, 'Generator diesel 96', 'office_supplies', 3600000, 'Test Fuel 96')::text);

reset role;
update public.fin_office_expense set status = 'rejected', decision_note = 'Wrong category'
 where id = (select v::uuid from t where k = 'fuel');
set local role authenticated;

select is(
  (select status from public.fin_office_expense where id = (select v::uuid from t where k = 'fuel')),
  'rejected',
  'An expense turned down before the change');

select lives_ok(
  $$select public.rpc_office_expense_save(current_date - 3, 'Generator diesel 96', 'rent_utilities',
      3600000, 'Test Fuel 96', p_id => (select v::uuid from t where k = 'fuel'))$$,
  'is fixed by anyone with full Finance');

select is(
  (select status || ' ' || category || ' ' || coalesce(decision_note, 'cleared')
     from public.fin_office_expense where id = (select v::uuid from t where k = 'fuel')),
  'approved rent_utilities cleared',
  'which records it, with the old decision cleared');

-- ------------------------------------------------------------------ budgets

select lives_ok(
  $$select public.rpc_office_budget_set(current_date, 'rent_utilities', 120000000)$$,
  'Finance sets a monthly budget for a category');

select lives_ok(
  $$select public.rpc_office_budget_set(current_date, 'rent_utilities', 110000000)$$,
  'and changes it');

select is(
  (select month::text || ' ' || amount_cents::text from public.fin_office_budget
    where category = 'rent_utilities' and month = date_trunc('month', current_date)::date),
  date_trunc('month', current_date)::date::text || ' 110000000',
  'One budget per category and month, filed under the first of the month');

-- ---------------------------------------------------------- who sees what

select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select ok(
  (select count(*) from public.fin_office_expense where description like '%96') = 2
  and (select count(*) from public.fin_office_budget where category = 'rent_utilities') >= 1,
  'An ops manager, who views Finance, reads expenses and budgets');

select throws_ok(
  $$select public.rpc_office_expense_save(current_date, 'Ops lunch', 'other', 500000, 'Cafe')$$,
  '42501', 'Only people with Office Finance or full Finance access can do this.',
  'but cannot record them');

select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.fin_office_expense),
  0,
  'Staff outside Finance see no office expenses');

-- ------------------------------------------------- a super admin records one

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into t values ('own', public.rpc_office_expense_save(
  current_date, 'Domain renewal 96', 'it_systems', 250000, 'Test Registrar 96')::text);

select is(
  (select status from public.fin_office_expense where id = (select v::uuid from t where k = 'own')),
  'approved',
  'A super admin''s expense is recorded the same way');

reset role;

select is(
  (select string_agg(e.action, ',' order by e.at) from audit.audit_event e
    where e.target_id = (select v::uuid from t where k = 'own')),
  'finance.office_expense_recorded',
  'with one audit entry saying who recorded it, and no approval to review');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'audit.unknown_action' and after ->> 'action' like 'finance.office%'),
  0,
  'Every office finance change was logged under a registered action');

-- ------------------------------------------------------- the lists Finance reads

select ok(
  not has_function_privilege('authenticated', 'public.fn_finance_movements(date, date)', 'execute'),
  'Nobody calls the movements function directly');

select ok(
  not has_function_privilege('anon', 'public.rpc_finance_transactions(date, date, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_finance_invoices(date, date)', 'execute'),
  'Signed-out visitors cannot list transactions or invoices');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ~ '(rpc|fn)_finance_'),
  0,
  'The wiring check finds nothing wrong with the Finance lists');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select (x ->> 'kind') || ' ' || (x ->> 'direction') || ' ' || (x ->> 'status') || ' ' || (x ->> 'party')
     from jsonb_array_elements(public.rpc_finance_transactions(current_date - 1, current_date + 1)) x
    where x ->> 'reference' = 'PAY-96-FLOAT'),
  'rider in successful Rider',
  'A paid float top-up is listed as money in from a rider');

select is(
  (select (x ->> 'status') || ' ' || (x ->> 'channel') || ' ' || (x ->> 'direction') || ' ' || (x ->> 'amount_cents')
     from jsonb_array_elements(public.rpc_finance_transactions(current_date - 1, current_date + 1, 'expense')) x
    where x ->> 'reference' = (select number from public.fin_office_expense
                                where id = (select v::uuid from t where k = 'rent'))),
  'successful bank out 100000000',
  'The paid office rent is listed as a bank transfer out');

select is(
  (select coalesce(sum((x ->> 'cents')::bigint), 0)
     from jsonb_array_elements(public.rpc_finance_transaction_summary(current_date - 1, current_date + 1)) x
    where x ->> 'source' = 'payment' and x ->> 'kind' = 'rider'),
  (select coalesce(sum((x ->> 'amount_cents')::bigint), 0)
     from jsonb_array_elements(public.rpc_finance_transactions(current_date - 1, current_date + 1, 'rider', 5000)) x
    where x ->> 'source' = 'payment'),
  'The summary adds up to the same movements as the list');

select is(
  (select (x ->> 'total_cents') || ' ' || (x ->> 'party_name') || ' ' || (x ->> 'party_kind')
     from jsonb_array_elements(public.rpc_finance_invoices(current_date - 1, current_date + 1)) x
    where x ->> 'id' = '96000000-0000-4000-8000-0000000000c1'),
  '123400 Test Grill 96 merchant',
  'A merchant statement is listed in cents, with the merchant''s name');

select is(
  (select count(*)::int from public.merchant_statement
    where id = '96000000-0000-4000-8000-0000000000c1'),
  0,
  'which the Finance role cannot read row by row');

select throws_ok(
  $$select public.rpc_finance_transactions(current_date - 900, current_date)$$,
  '22023', 'Choose a period of two years or less.',
  'A period longer than two years is refused');

select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_finance_transaction_summary(current_date - 7, current_date)$$,
  'An ops manager, who views Finance, reads the lists');

select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_finance_transactions(current_date - 7, current_date)$$,
  '42501', 'Only people who reach Finance can see this.',
  'Staff outside Finance cannot list transactions');

select throws_ok(
  $$select public.rpc_finance_invoices(current_date - 7, current_date)$$,
  '42501', 'Only people who reach Finance can see this.',
  'or invoices');

reset role;

select * from finish();
rollback;
