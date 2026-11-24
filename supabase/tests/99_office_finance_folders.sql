-- Office Finance: the five folders on its Files tab.
--
-- The five exist in order, marked office_finance, each with its folders in
-- order; only top-level folders can carry an area; the view returns area.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is(
  (select array_agg(name order by sort, name) from public.company_folder
    where parent_id is null and area = 'office_finance'),
  array['Income & Receivables', 'Payroll & Staff Payments', 'Petty Cash & Advances',
        'Suppliers & Payables', 'Bank & Cash Accounts'],
  'The five Office Finance folders exist, in the order they were listed');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.parent_id is null and p.name = 'Income & Receivables'),
  array['Company revenue', 'Other income', 'Invoices issued', 'Unpaid customer or partner balances'],
  'Income & Receivables holds its four folders, in order');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.parent_id is null and p.name = 'Payroll & Staff Payments'),
  array['Salaries', 'Allowances', 'Bonuses', 'Reimbursements', 'Payroll deductions'],
  'Payroll & Staff Payments holds its five');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.parent_id is null and p.name = 'Petty Cash & Advances'),
  array['Office cash', 'Staff advances', 'Field expenses', 'Cash reconciliation'],
  'Petty Cash & Advances holds its four');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.parent_id is null and p.name = 'Suppliers & Payables'),
  array['Supplier invoices', 'Bills', 'Payment requests', 'Outstanding balances'],
  'Suppliers & Payables holds its four');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.parent_id is null and p.name = 'Bank & Cash Accounts'),
  array['Company bank accounts', 'M-PESA accounts', 'Cash balances', 'Transfers'],
  'Bank & Cash Accounts holds its four');

select is(
  (select count(*)::int from public.company_folder where area is not null and parent_id is not null),
  0,
  'Only top-level folders carry an area');

select throws_ok(
  $$update public.company_folder set area = 'office_finance'
     where id = (select s.id from public.company_folder s
                   join public.company_folder p on p.id = s.parent_id
                  where p.name = 'Bank & Cash Accounts' and s.name = 'Transfers')$$,
  '23514', null,
  'A folder inside another cannot be marked');

select is(
  (select count(*)::int from public.company_folder_v where area = 'office_finance'),
  5,
  'The folder view returns area');

select * from finish();
rollback;
