-- Finance → Invoices: client invoices, on the books.
--
-- Who reads and who writes; amounts worked out here (prices without VAT, VAT
-- added per line at 16%, 0% or exempt), whatever the browser sends; issuing
-- numbers the invoice in the KRA series, files the tax invoice and posts one
-- balanced transaction, once; payments post and settle it, never beyond what
-- is owed; voiding reverses the posting and files a credit note, and is
-- refused once money has come in; an issued invoice never changes; every
-- action is registered; and the invoice list still carries host invoices,
-- hotel statements and merchant statements beside client invoices.

begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into t values ('today', ((now() at time zone 'Africa/Nairobi')::date)::text);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('99c10000-0000-4000-8000-0000000000a1'::uuid, 'fin.one99c@test.local'),
  ('99c10000-0000-4000-8000-0000000000a2'::uuid, 'ops99c@test.local'),
  ('99c10000-0000-4000-8000-0000000000a3'::uuid, 'riders99c@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('99c10000-0000-4000-8000-0000000000b1', '99c10000-0000-4000-8000-0000000000a1', 'fin.one99c@test.local', 'Finance One 99c'),
  ('99c10000-0000-4000-8000-0000000000b2', '99c10000-0000-4000-8000-0000000000a2', 'ops99c@test.local', 'Ops 99c'),
  ('99c10000-0000-4000-8000-0000000000b3', '99c10000-0000-4000-8000-0000000000a3', 'riders99c@test.local', 'Riders 99c');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('99c10000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('99c10000-0000-4000-8000-0000000000b2'::uuid, 'ops_manager'),
  ('99c10000-0000-4000-8000-0000000000b3'::uuid, 'rider_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

/* One document of each kind the list already carried. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id)
values ('cccccccc-0000-4000-8000-0000000099c1', 'Test Grill 99c Limited', 'Test Grill 99c',
        'restaurant', 'Owner 99c', '+254712000991', 'owner99c@shop.example',
        (select id from public.city where slug = 'nairobi'));

insert into public.merchant_statement (id, merchant_id, period_start, period_end, gross_kes,
                                       commission_kes, net_kes, status)
values ('99c10000-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-0000000099c1',
        current_date - 7, current_date - 1, 1500, 266, 1234, 'sent');

insert into public.host (id, display_name, phone)
values ('99c10000-0000-4000-8000-0000000000e1', 'Test Host 99c', '+254712000992');

insert into public.host_invoice (id, host_id, period, total, status)
values ('99c10000-0000-4000-8000-0000000000c2', '99c10000-0000-4000-8000-0000000000e1',
        date_trunc('month', current_date)::date, 50000, 'sent');

insert into public.hotel (id, name) values ('99c10000-0000-4000-8000-0000000000e2', 'Test Hotel 99c');

insert into public.hotel_statement (id, hotel_id, period, net_invoiced, status)
values ('99c10000-0000-4000-8000-0000000000c3', '99c10000-0000-4000-8000-0000000000e2',
        date_trunc('month', current_date)::date, 70000, 'sent');

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('fin_client', 'fin_invoice', 'fin_invoice_line', 'fin_invoice_payment')
      and c.relrowsecurity),
  4,
  'All four client invoice tables have row-level security');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ~ '(fin_client|fin_invoice|rpc_fin_letterhead|rpc_finance_invoices)'),
  0,
  'The wiring check finds nothing wrong with client invoices');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(finance\.client_[a-z_]+)''', 'g') as m
     where p.proname like 'rpc\_fin\_%') used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action a client invoice function logs is in the audit registry');

select is(
  (select count(distinct m[1])::int
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(finance\.client_[a-z_]+)''', 'g') as m
    where p.proname like 'rpc\_fin\_%'),
  7,
  'One action for each thing Finance does to a client or an invoice');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'rpc\_fin\_client%' or p.proname like 'rpc\_fin\_invoice%'
           or p.proname = 'rpc_fin_letterhead')) = 10
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'rpc\_fin\_client%' or p.proname like 'rpc\_fin\_invoice%'
            or p.proname = 'rpc_fin_letterhead')
       and has_function_privilege('anon', p.oid, 'execute')),
  'Signed-out visitors can call none of the ten client invoice functions');

select ok(
  not has_function_privilege('authenticated', 'ledger.fn_post_fin_invoice(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'ledger.fn_post_fin_invoice_payment(uuid)', 'execute')
  and not has_function_privilege('anon', 'ledger.fn_post_fin_invoice(uuid)', 'execute')
  and not has_function_privilege('anon', 'ledger.fn_post_fin_invoice_payment(uuid)', 'execute'),
  'Nobody posts a client invoice to the ledger directly');

select is(
  (select public::text || ' ' || array_to_string(allowed_mime_types, ',')
     from storage.buckets where id = 'finance-invoices'),
  'false application/pdf',
  'Invoice PDFs are kept in a private bucket that takes PDFs only');

select is(
  (select string_agg(code || ' ' || kind::text || ' ' || normal_side, ', ' order by code)
     from ledger.account where code in ('receivable.client', 'revenue.other_services')),
  'receivable.client asset D, revenue.other_services revenue C',
  'The client receivable and the other-services revenue account are in the chart');

-- ---------------------------------------------------------- who may write

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99c10000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_fin_client_save(null, '{"legal_name":"Nope 99c Limited"}')$$,
  '42501', 'Only people with full Finance access can do this.',
  'Staff outside Finance cannot add clients');

select throws_ok(
  $$select public.rpc_fin_clients()$$,
  '42501', 'Only people who reach Finance can see this.',
  'or list them');

-- ------------------------------------------------------------------ clients

select set_config('request.jwt.claims',
  '{"sub":"99c10000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t values ('client', public.rpc_fin_client_save(null, jsonb_build_object(
  'legal_name', '  Test Client 99c Limited ',
  'trading_name', 'Client 99c',
  'kra_pin', 'p051234567x',
  'email', 'Accounts@Client99c.example',
  'cc_emails', 'ap@client99c.example; CFO@client99c.example',
  'payment_terms_days', 30))::text);

select is(
  (select legal_name || ' | ' || kra_pin || ' | ' || email || ' | ' || array_to_string(cc_emails, ',')
          || ' | ' || payment_terms_days::text || ' | ' || kind
     from public.fin_client where id = (select v::uuid from t where k = 'client')),
  'Test Client 99c Limited | P051234567X | accounts@client99c.example | ap@client99c.example,cfo@client99c.example | 30 | corporate',
  'Finance adds a client, its PIN and addresses tidied');

select throws_ok(
  $$select public.rpc_fin_client_save(null, '{"legal_name":"Bad PIN 99c Limited","kra_pin":"12345"}')$$,
  '22023', 'A KRA PIN is a letter, nine digits and a letter, like P051234567X.',
  'A KRA PIN in the wrong shape is refused');

-- ------------------------------------------------------------------- drafts

/* Four lines: 2 × 5,000.00 at 16%; 1 × 2,500.00 zero-rated; 3 × 333.33
   exempt; 1.5 × 1,234.57 at 16%. The totals the browser claims are ignored. */
insert into t values ('inv1', public.rpc_fin_invoice_save(null, '99c10000-0000-4000-8000-0000000000d1',
  jsonb_build_object(
    'client_id', (select v from t where k = 'client'),
    'issue_date', (select v from t where k = 'today'),
    'net_cents', 1, 'vat_cents', 1, 'gross_cents', 2,
    'lines', jsonb_build_array(
      jsonb_build_object('description', 'Corporate concierge retainer', 'quantity', 2,
        'unit_price_cents', 500000, 'vat_rate', 'standard',
        'revenue_account', 'revenue.other_services', 'net_cents', 1, 'vat_cents', 0),
      jsonb_build_object('description', 'Export logistics', 'quantity', 1,
        'unit_price_cents', 250000, 'vat_rate', 'zero', 'revenue_account', 'revenue.service_fee'),
      jsonb_build_object('description', 'Staff training', 'quantity', 3,
        'unit_price_cents', 33333, 'vat_rate', 'exempt',
        'revenue_account', 'revenue.other_services'),
      jsonb_build_object('description', 'Courier runs', 'quantity', '1.5',
        'unit_price_cents', 123457, 'vat_rate', 'standard',
        'revenue_account', 'revenue.delivery_fee'))))::text);

select is(
  (select status || ' ' || net_cents || ' ' || vat_cents || ' ' || gross_cents
     from public.fin_invoice where id = (select v::uuid from t where k = 'inv1')),
  'draft 1535185 189630 1724815',
  'A draft''s totals are worked out from its lines, not taken from the browser');

select is(
  (select string_agg(vat_rate || ' ' || vat_pct || ' ' || net_cents || ' ' || vat_cents, ' | ' order by sort)
     from public.fin_invoice_line where invoice_id = (select v::uuid from t where k = 'inv1')),
  'standard 16.00 1000000 160000 | zero 0.00 250000 0 | exempt 0.00 99999 0 | standard 16.00 185186 29630',
  'VAT is added per line at 16%, rounded to the cent; zero-rated and exempt lines carry none');

select is(
  (select (due_date - issue_date)::int from public.fin_invoice
    where id = (select v::uuid from t where k = 'inv1')),
  30,
  'The due date follows the client''s payment terms');

select is(
  public.rpc_fin_invoice_save(null, '99c10000-0000-4000-8000-0000000000d1',
    jsonb_build_object('client_id', (select v from t where k = 'client'),
      'issue_date', (select v from t where k = 'today'),
      'lines', jsonb_build_array(
        jsonb_build_object('description', 'Corporate concierge retainer', 'quantity', 2,
          'unit_price_cents', 500000, 'vat_rate', 'standard',
          'revenue_account', 'revenue.other_services'),
        jsonb_build_object('description', 'Export logistics', 'quantity', 1,
          'unit_price_cents', 250000, 'vat_rate', 'zero', 'revenue_account', 'revenue.service_fee'),
        jsonb_build_object('description', 'Staff training', 'quantity', 3,
          'unit_price_cents', 33333, 'vat_rate', 'exempt',
          'revenue_account', 'revenue.other_services'),
        jsonb_build_object('description', 'Courier runs', 'quantity', 1.5,
          'unit_price_cents', 123457, 'vat_rate', 'standard',
          'revenue_account', 'revenue.delivery_fee'))))::text,
  (select v from t where k = 'inv1'),
  'Saving the same form twice finds the first draft');

select is(
  (select count(*)::int || ' ' || (select count(*) from public.fin_invoice_line l
                                    where l.invoice_id = (select v::uuid from t where k = 'inv1'))
     from public.fin_invoice where client_id = (select v::uuid from t where k = 'client')),
  '1 4',
  'and keeps one draft with its four lines');

select throws_ok(
  $$select public.rpc_fin_invoice_save(null, gen_random_uuid(), jsonb_build_object(
      'client_id', (select v from t where k = 'client'),
      'lines', jsonb_build_array(jsonb_build_object('description', 'Something', 'quantity', 1,
        'unit_price_cents', 1000, 'vat_rate', 'reduced', 'revenue_account', 'revenue.other_services'))))$$,
  '22023', 'Line 1: choose 16%, 0% or Exempt for VAT.',
  'A VAT treatment other than 16%, 0% or exempt is refused');

select throws_ok(
  $$select public.rpc_fin_invoice_save(null, gen_random_uuid(), jsonb_build_object(
      'client_id', (select v from t where k = 'client'),
      'lines', jsonb_build_array(jsonb_build_object('description', 'Something', 'quantity', 1,
        'unit_price_cents', 1000, 'vat_rate', 'standard', 'revenue_account', 'cash.bank'))))$$,
  '22023', 'Line 1: choose what the line is for.',
  'A line posts only to one of the allowed revenue accounts');

select throws_ok(
  $$select public.rpc_fin_invoice_save(null, gen_random_uuid(), jsonb_build_object(
      'client_id', (select v from t where k = 'client'),
      'lines', jsonb_build_array(jsonb_build_object('description', 'Something', 'quantity', 0,
        'unit_price_cents', 1000, 'vat_rate', 'standard', 'revenue_account', 'revenue.other_services'))))$$,
  '22023', 'Line 1: enter a quantity above zero.',
  'A line needs a quantity above zero');

insert into t values ('inv0', public.rpc_fin_invoice_save(null, '99c10000-0000-4000-8000-0000000000d0',
  jsonb_build_object('client_id', (select v from t where k = 'client'),
                     'issue_date', (select v from t where k = 'today')))::text);

select throws_ok(
  $$select public.rpc_fin_invoice_issue((select v::uuid from t where k = 'inv0'))$$,
  '23514', 'Add at least one line before issuing.',
  'A draft with no lines cannot be issued');

-- --------------------------------------------------------- a viewer reads

select set_config('request.jwt.claims',
  '{"sub":"99c10000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(
  (public.rpc_fin_invoice_detail((select v::uuid from t where k = 'inv1')) -> 'invoice' ->> 'status')
    || ' ' || jsonb_array_length(public.rpc_fin_clients() -> 'clients')::text,
  'draft ' || (select count(*)::text from public.fin_client),
  'An ops manager, who views Finance, reads invoices and clients');

select throws_ok(
  $$select public.rpc_fin_invoice_save(null, gen_random_uuid(), jsonb_build_object(
      'client_id', (select v from t where k = 'client')))$$,
  '42501', 'Only people with full Finance access can do this.',
  'but cannot write them');

select throws_ok(
  $$select public.rpc_fin_letterhead()$$,
  '42501', 'Only people with full Finance access can do this.',
  'nor read the letterhead');

-- ------------------------------------------------------------------- issue

select set_config('request.jwt.claims',
  '{"sub":"99c10000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t values ('number',
  public.rpc_fin_invoice_issue((select v::uuid from t where k = 'inv1')) ->> 'number');

select ok(
  (select v from t where k = 'number') ~ '^NEXG-INV-[0-9]{4}-[0-9]{5,}$'
  and (select number from public.fin_invoice where id = (select v::uuid from t where k = 'inv1'))
      = (select v from t where k = 'number'),
  'Issuing numbers the invoice in the KRA series');

select is(
  (select ti.kind || ' ' || ti.purpose || ' ' || ti.party_type || ' ' || ti.party_name || ' '
          || ti.party_pin || ' ' || ti.kra_status || ' ' || ti.gross_cents || ' '
          || (select count(*) from public.tax_invoice_line l where l.invoice_id = ti.id)
     from public.tax_invoice ti
    where ti.number = (select v from t where k = 'number')),
  'tax_invoice client_invoice client Test Client 99c Limited P051234567X pending 1724815 4',
  'and files a tax invoice with its four lines, pending at KRA');

select is(
  (select sum(e.debit)::text || ' ' || sum(e.credit)::text
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'fin_invoice:' || (select v from t where k = 'inv1')),
  '1724815 1724815',
  'Issuing posts one balanced transaction for the total');

select is(
  (select string_agg(e.account_code || ' ' || case when e.debit > 0 then 'D ' || e.debit
                                                   else 'C ' || e.credit end,
                     ', ' order by e.debit desc, e.account_code)
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'fin_invoice:' || (select v from t where k = 'inv1')),
  'receivable.client D 1724815, revenue.delivery_fee C 185186, revenue.other_services C 1099999, revenue.service_fee C 250000, tax.vat_output C 189630',
  'The client owes the total; revenue is credited per category net of VAT, and VAT to output tax');

select is(
  (select issue_txn_id from public.fin_invoice where id = (select v::uuid from t where k = 'inv1')),
  (select id from ledger.transaction
    where idempotency_key = 'fin_invoice:' || (select v from t where k = 'inv1')),
  'The invoice points at its posting');

select throws_ok(
  $$select public.rpc_fin_invoice_issue((select v::uuid from t where k = 'inv1'))$$,
  '23514', null,
  'An invoice is issued once');

select throws_ok(
  $$select public.rpc_fin_invoice_save((select v::uuid from t where k = 'inv1'), null,
      jsonb_build_object('client_id', (select v from t where k = 'client')))$$,
  '23514', 'Only a draft can be changed. An issued invoice is corrected by voiding it and issuing a new one.',
  'An issued invoice cannot be edited as a draft');

select throws_ok(
  $$update public.fin_invoice set notes = 'Changed' where id = (select v::uuid from t where k = 'inv1')$$,
  '42501', null,
  'Finance changes invoices only through the functions');

reset role;

select throws_ok(
  $$update public.fin_invoice set net_cents = net_cents - 1, gross_cents = gross_cents - 1
     where id = (select v::uuid from t where k = 'inv1')$$,
  '23514', 'An issued invoice''s client, number, dates and amounts never change. Void it and issue a new one.',
  'An issued invoice''s amounts never change, even for the database owner');

select throws_ok(
  $$delete from public.fin_invoice_line where invoice_id = (select v::uuid from t where k = 'inv1')$$,
  '23514', 'The lines of an issued invoice never change. Void it and issue a new one.',
  'nor do its lines');

-- ---------------------------------------------------------------- payments

set local role authenticated;

select is(
  public.rpc_fin_invoice_record_payment((select v::uuid from t where k = 'inv1'), 1000000,
    'bank', ' ft99c-part ') ->> 'status',
  'issued',
  'A part payment is recorded and the invoice stays open');

select is(
  (select p.reference || ' ' || p.cash_account || ' ' || (p.txn_id is not null)::text
     from public.fin_invoice_payment p where p.invoice_id = (select v::uuid from t where k = 'inv1')),
  'FT99C-PART cash.bank true',
  'with its reference in capitals, on the bank account');

select is(
  (select string_agg(e.account_code || ' ' || case when e.debit > 0 then 'D ' || e.debit
                                                   else 'C ' || e.credit end,
                     ', ' order by e.debit desc)
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'fin_invoice_payment:'
          || (select p.id::text from public.fin_invoice_payment p where p.reference = 'FT99C-PART')),
  'cash.bank D 1000000, receivable.client C 1000000',
  'A bank payment posts to the bank and clears that much of the receivable');

select throws_ok(
  $$select public.rpc_fin_invoice_record_payment((select v::uuid from t where k = 'inv1'), 724816,
      'mpesa', 'SKL99COVER')$$,
  '23514', 'That is more than the KES 7,248.15 still owed on this invoice.',
  'No payment is recorded beyond what is owed');

select throws_ok(
  $$select public.rpc_fin_invoice_record_payment((select v::uuid from t where k = 'inv1'), 1000,
      'bank', 'Ft99c-Part')$$,
  '23514', null,
  'A reference is recorded once, whatever its case');

select lives_ok(
  $$select public.rpc_fin_invoice_record_payment((select v::uuid from t where k = 'inv1'), 724815,
      'mpesa', 'skl99cfull')$$,
  'The rest is paid by M-PESA');

select is(
  (select status || ' ' || (paid_at is not null)::text from public.fin_invoice
    where id = (select v::uuid from t where k = 'inv1')),
  'paid true',
  'Paid in full, the invoice is paid');

select is(
  (select string_agg(e.account_code || ' ' || case when e.debit > 0 then 'D ' || e.debit
                                                   else 'C ' || e.credit end,
                     ', ' order by e.debit desc)
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'fin_invoice_payment:'
          || (select p.id::text from public.fin_invoice_payment p where p.reference = 'SKL99CFULL')),
  'cash.mpesa_paybill D 724815, receivable.client C 724815',
  'An M-PESA payment posts to the paybill');

select is(
  (select sum(e.debit - e.credit)::bigint
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where e.account_code = 'receivable.client'
      and (tx.idempotency_key = 'fin_invoice:' || (select v from t where k = 'inv1')
           or tx.idempotency_key in (select 'fin_invoice_payment:' || p.id::text
                                       from public.fin_invoice_payment p
                                      where p.invoice_id = (select v::uuid from t where k = 'inv1')))),
  0::bigint,
  'and nothing of it is left owed on the ledger');

select throws_ok(
  $$select public.rpc_fin_invoice_record_payment((select v::uuid from t where k = 'inv1'), 100,
      'bank', 'FT99C-AGAIN')$$,
  '23514', 'This invoice is already paid in full.',
  'A paid invoice takes no more payments');

select throws_ok(
  $$select public.rpc_fin_invoice_void((select v::uuid from t where k = 'inv1'), 'Changed our mind')$$,
  '23514', 'Payments are recorded against this invoice, so it cannot be voided.',
  'A paid invoice cannot be voided');

-- -------------------------------------------------------------------- void

/* A second invoice, part paid; a third, untouched. */
insert into t values ('inv2', public.rpc_fin_invoice_save(null, '99c10000-0000-4000-8000-0000000000d2',
  jsonb_build_object('client_id', (select v from t where k = 'client'),
    'issue_date', (select v from t where k = 'today'),
    'lines', jsonb_build_array(jsonb_build_object('description', 'Event concierge', 'quantity', 1,
      'unit_price_cents', 100000, 'vat_rate', 'standard', 'revenue_account', 'revenue.concierge_fee'))))::text);
insert into t values ('inv2_issued',
  public.rpc_fin_invoice_issue((select v::uuid from t where k = 'inv2'))::text);
insert into t values ('inv2_paid', public.rpc_fin_invoice_record_payment(
  (select v::uuid from t where k = 'inv2'), 16000, 'bank', 'FT99C-DEPOSIT')::text);

insert into t values ('inv3', public.rpc_fin_invoice_save(null, '99c10000-0000-4000-8000-0000000000d3',
  jsonb_build_object('client_id', (select v from t where k = 'client'),
    'issue_date', (select v from t where k = 'today'),
    'lines', jsonb_build_array(jsonb_build_object('description', 'Featured placement', 'quantity', 1,
      'unit_price_cents', 100000, 'vat_rate', 'standard', 'revenue_account', 'revenue.featured'))))::text);
insert into t values ('inv3_issued',
  public.rpc_fin_invoice_issue((select v::uuid from t where k = 'inv3'))::text);

select throws_ok(
  $$select public.rpc_fin_invoice_void((select v::uuid from t where k = 'inv2'), 'Wrong client')$$,
  '23514', 'Payments are recorded against this invoice, so it cannot be voided.',
  'Nor can one paid in part');

select throws_ok(
  $$select public.rpc_fin_invoice_void((select v::uuid from t where k = 'inv3'), '  ')$$,
  '22023', 'Say why the invoice is voided.',
  'Voiding needs a reason');

select lives_ok(
  $$select public.rpc_fin_invoice_void((select v::uuid from t where k = 'inv3'),
      'Raised against the wrong client')$$,
  'An issued invoice with nothing paid is voided');

select is(
  (select tx.id from ledger.transaction tx
    where tx.reversal_of = (select issue_txn_id from public.fin_invoice
                             where id = (select v::uuid from t where k = 'inv3'))),
  (select void_txn_id from public.fin_invoice where id = (select v::uuid from t where k = 'inv3')),
  'Voiding reverses the invoice''s posting');

select is(
  (select sum(e.debit - e.credit)::bigint
     from ledger.entry e join ledger.transaction tx on tx.id = e.transaction_id
    where e.account_code = 'receivable.client'
      and tx.id in (select issue_txn_id from public.fin_invoice where id = (select v::uuid from t where k = 'inv3')
                    union all
                    select void_txn_id from public.fin_invoice where id = (select v::uuid from t where k = 'inv3'))),
  0::bigint,
  'so the client owes nothing for it');

select is(
  (select f.status || ' ' || f.void_reason || ' ' || cn.kind || ' ' || (cn.number like 'NEXG-CRN-%')::text
          || ' ' || cn.purpose || ' ' || cn.gross_cents || ' ' || cn.kra_status
     from public.fin_invoice f join public.tax_invoice cn on cn.id = f.credit_note_id
    where f.id = (select v::uuid from t where k = 'inv3')),
  'void Raised against the wrong client credit_note true client_invoice 116000 pending',
  'and files a credit note for the whole amount for KRA');

select throws_ok(
  $$select public.rpc_fin_invoice_void((select v::uuid from t where k = 'inv3'), 'Again')$$,
  '23514', 'This invoice is already void.',
  'An invoice is voided once');

-- --------------------------------------------------- KRA, sending and the PDF

select lives_ok(
  $$select public.rpc_tax_set_kra_status(
      (select tax_invoice_id from public.fin_invoice where id = (select v::uuid from t where k = 'inv1')),
      'accepted', 'KRA99CREF')$$,
  'Finance records the KRA reference on the tax invoice');

select is(
  (select (d -> 'tax_invoice' ->> 'kra_status') || ' ' || (d -> 'tax_invoice' ->> 'kra_reference')
          || ' ' || (d ->> 'balance_cents') || ' ' || jsonb_array_length(d -> 'payments')
     from (select public.rpc_fin_invoice_detail((select v::uuid from t where k = 'inv1')) as d) x),
  'accepted KRA99CREF 0 2',
  'The invoice shows its KRA reference, its two payments and nothing left to pay');

select throws_ok(
  $$select public.rpc_fin_invoice_mark_sent((select v::uuid from t where k = 'inv0'), 'a@b.example')$$,
  '23514', 'Issue the invoice before sending it.',
  'A draft is not sent');

select lives_ok(
  $$select public.rpc_fin_invoice_mark_sent((select v::uuid from t where k = 'inv1'),
      'accounts@client99c.example')$$,
  'Sending an issued invoice is recorded');

reset role;
insert into storage.objects (bucket_id, name, owner)
values ('finance-invoices',
        '99c10000-0000-4000-8000-0000000000a1/' || (select v from t where k = 'inv1') || '/'
          || (select v from t where k = 'number') || '.pdf',
        '99c10000-0000-4000-8000-0000000000a1');
set local role authenticated;

select lives_ok(
  format($$select public.rpc_fin_invoice_pdf_record(%L, %L, %L)$$,
    (select v from t where k = 'inv1'),
    '99c10000-0000-4000-8000-0000000000a1/' || (select v from t where k = 'inv1') || '/'
      || (select v from t where k = 'number') || '.pdf',
    repeat('ab', 32)),
  'The stored PDF is recorded with its SHA-256');

select throws_ok(
  format($$select public.rpc_fin_invoice_pdf_record(%L, %L, %L)$$,
    (select v from t where k = 'inv2'),
    '99c10000-0000-4000-8000-0000000000a1/' || (select v from t where k = 'inv2') || '/'
      || (select number from public.fin_invoice where id = (select v::uuid from t where k = 'inv2')) || '.pdf',
    repeat('ab', 32)),
  'P0002', 'The PDF did not arrive. Try again.',
  'A PDF that is not in storage is not recorded');

select throws_ok(
  format($$select public.rpc_fin_invoice_pdf_record(%L, %L, %L)$$,
    (select v from t where k = 'inv2'),
    '99c10000-0000-4000-8000-0000000000a1/' || (select v from t where k = 'inv1') || '/'
      || (select v from t where k = 'number') || '.pdf',
    repeat('ab', 32)),
  '22023', 'That is not where this invoice''s PDF is kept.',
  'nor is another invoice''s PDF');

select lives_ok(
  $$select public.rpc_fin_letterhead()$$,
  'Full Finance reads the letterhead for the PDF');

-- ------------------------------------------------------------------ the list

select is(
  (select string_agg((x ->> 'number' = 'Draft')::text || ':' || (x ->> 'status') || ':' || (x ->> 'balance_cents'),
                     ',' order by x ->> 'status')
     from jsonb_array_elements(public.rpc_finance_invoices(current_date - 7, current_date + 2)) x
    where x ->> 'party_kind' = 'client' and x ->> 'party_id' = (select v from t where k = 'client')),
  'false:credited:0,true:draft:0,false:paid:0,false:sent:100000',
  'Client invoices are listed: drafts as Draft, issued as sent with what is still owed, paid, and void as credited');

select is(
  (select string_agg(distinct x ->> 'party_kind', ',')
     from jsonb_array_elements(public.rpc_finance_invoices(current_date - 7, current_date + 2)) x
    where x ->> 'id' in ('99c10000-0000-4000-8000-0000000000c1', '99c10000-0000-4000-8000-0000000000c2',
                         '99c10000-0000-4000-8000-0000000000c3')),
  'host,hotel,merchant',
  'beside host invoices, hotel statements and merchant statements');

select is(
  (select (x ->> 'total_cents') || ' ' || (x ->> 'party_name') || ' ' || coalesce(x ->> 'balance_cents', 'none')
     from jsonb_array_elements(public.rpc_finance_invoices(current_date - 7, current_date + 2)) x
    where x ->> 'id' = '99c10000-0000-4000-8000-0000000000c1'),
  '123400 Test Grill 99c none',
  'which read as before');

-- ------------------------------------------------------------------- audit

reset role;

select is(
  (select count(distinct e.action)::int from audit.audit_event e
    where e.action like 'finance.client%'
      and e.target_id in (select v::uuid from t where k in ('client', 'inv0', 'inv1', 'inv2', 'inv3'))),
  7,
  'Every kind of change was logged');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'audit.unknown_action' and after ->> 'action' like 'finance.client%'),
  0,
  'under a registered action');

select is(
  (select m.review_state::text from audit.audit_event e
     join audit.event_meta m on m.event_id = e.id
    where e.action = 'finance.client_invoice_voided'
      and e.target_id = (select v::uuid from t where k = 'inv3')),
  'needs_review',
  'and a void waits in the audit log for review');

select * from finish();
rollback;
