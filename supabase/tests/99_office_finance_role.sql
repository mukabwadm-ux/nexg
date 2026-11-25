-- Office Finance: its own role, and expenses recorded straight away.
--
-- The office_finance role reaches Office Finance only. Whoever holds it
-- records, pays and cancels office expenses and sets budgets, each expense
-- counting at once; Finance's other money (clients, invoices) stays closed.
-- Roles that reach Finance keep the same reach on Office Finance.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('99f10000-0000-4000-8000-0000000000a1'::uuid, 'office.fin99@test.local'),
  ('99f10000-0000-4000-8000-0000000000a2'::uuid, 'ops.fin99@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('99f10000-0000-4000-8000-0000000000b1', '99f10000-0000-4000-8000-0000000000a1', 'office.fin99@test.local', 'Office Fin 99'),
  ('99f10000-0000-4000-8000-0000000000b2', '99f10000-0000-4000-8000-0000000000a2', 'ops.fin99@test.local', 'Ops Fin 99');

-- --------------------------------------------------------------- the role

select is(
  (select label from public.role where key = 'office_finance'),
  'Office Finance',
  'There is an Office Finance role');

select is(
  (select href || ' ' || label from public.console_module where key = 'office_finance'),
  '/finance/office Office Finance',
  'and an Office Finance module');

select lives_ok(
  $$insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
    select '99f10000-0000-4000-8000-0000000000b1', r.id, null, '00000000-0000-4000-8000-00000000000a'
      from public.role r where r.key = 'office_finance'$$,
  'It is granted in one step, without a second approver');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select '99f10000-0000-4000-8000-0000000000b2', r.id, null, '00000000-0000-4000-8000-00000000000a'
  from public.role r where r.key = 'ops_manager';

select is(
  (select level from public.role_module_access where role_key = 'finance' and module_key = 'office_finance'),
  (select level from public.role_module_access where role_key = 'finance' and module_key = 'finance'),
  'Finance keeps the same reach on Office Finance');

-- ----------------------------------------------------- an Office Finance holder

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99f10000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(authz.office_finance_level(), 'full', 'The holder has full Office Finance');

select ok(not authz.reaches_module('finance'), 'but does not reach the rest of Finance');

insert into t values ('lunch', public.rpc_office_expense_save(
  current_date, 'Office lunch 99', 'other', 180000, 'Test Cafe 99')::text);

select is(
  (select status || ' ' || (submitted_by = '99f10000-0000-4000-8000-0000000000b1')::text
     from public.fin_office_expense where id = (select v::uuid from t where k = 'lunch')),
  'approved true',
  'Whoever holds it records an expense, straight away and under their name');

select lives_ok(
  $$select public.rpc_office_expense_save(current_date, 'Office lunch for six 99', 'other', 180000,
      'Test Cafe 99', p_id => (select v::uuid from t where k = 'lunch'))$$,
  'changes it');

select lives_ok(
  $$select public.rpc_office_expense_pay((select v::uuid from t where k = 'lunch'), 'cash')$$,
  'marks it paid');

insert into t values ('taxi', public.rpc_office_expense_save(
  current_date, 'Taxi to the bank 99', 'transport_travel', 90000, 'Test Taxi 99')::text);

select lives_ok(
  $$select public.rpc_office_expense_cancel((select v::uuid from t where k = 'taxi'), 'Recorded twice')$$,
  'cancels one with a reason');

select lives_ok(
  $$select public.rpc_office_budget_set(current_date, 'other', 5000000)$$,
  'and sets a budget');

select is(
  (select count(*)::int from public.fin_office_expense where description like '%99'),
  2,
  'and reads office expenses');

select throws_ok(
  $$select public.rpc_fin_client_save(null, '{"legal_name":"Nope 99f Limited"}')$$,
  '42501', 'Only people with full Finance access can do this.',
  'Client invoicing still needs full Finance');

-- ------------------------------------------------------ someone without it

select set_config('request.jwt.claims',
  '{"sub":"99f10000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(authz.office_finance_level(), 'view', 'An ops manager, who views Finance, views Office Finance');

select throws_ok(
  $$select public.rpc_office_expense_save(current_date, 'Ops lunch 99', 'other', 50000, 'Cafe')$$,
  '42501', 'Only people with Office Finance or full Finance access can do this.',
  'and cannot record expenses');

reset role;

select is(
  (select string_agg(e.action, ',' order by e.at) from audit.audit_event e
    where e.target_id = (select v::uuid from t where k = 'lunch')),
  'finance.office_expense_recorded,finance.office_expense_updated,finance.office_expense_paid',
  'Every step is in the audit log');

select * from finish();
rollback;
