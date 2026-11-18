-- Finance → Reconciliations → New Reconciliation: statement imports.
--
-- The private bucket and who may put files in it; who reads imports; an
-- import refusing a file that never arrived and the same file twice; each
-- matching rule on a small synthetic M-PESA statement; resolving (a note is
-- required), closing only when nothing is open, voiding; and every change
-- audited under a registered action.

begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* One line of the first import with what it matched. */
create temporary view line_result as
  select l.line_no, m.id as match_id, m.result, m.rule, m.record_type, m.record_id,
         m.record_reference, m.expected_ledger, m.ledger_found, m.difference_cents, m.note,
         m.decided_at, l.other_party, l.details
    from public.fin_statement_line l
    join public.fin_statement_match m on m.line_id = l.id
   where l.import_id = (select v::uuid from t where k = 'import');
grant select on line_result to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('f5000000-0000-4000-8000-0000000000a1'::uuid, 'fin.one.stmt@test.local'),
  ('f5000000-0000-4000-8000-0000000000a2'::uuid, 'fin.two.stmt@test.local'),
  ('f5000000-0000-4000-8000-0000000000a3'::uuid, 'ops.stmt@test.local'),
  ('f5000000-0000-4000-8000-0000000000a4'::uuid, 'riders.stmt@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('f5000000-0000-4000-8000-0000000000b1', 'f5000000-0000-4000-8000-0000000000a1', 'fin.one.stmt@test.local', 'Finance One Stmt'),
  ('f5000000-0000-4000-8000-0000000000b2', 'f5000000-0000-4000-8000-0000000000a2', 'fin.two.stmt@test.local', 'Finance Two Stmt'),
  ('f5000000-0000-4000-8000-0000000000b3', 'f5000000-0000-4000-8000-0000000000a3', 'ops.stmt@test.local', 'Ops Stmt'),
  ('f5000000-0000-4000-8000-0000000000b4', 'f5000000-0000-4000-8000-0000000000a4', 'riders.stmt@test.local', 'Riders Stmt');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('f5000000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('f5000000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
  ('f5000000-0000-4000-8000-0000000000b3'::uuid, 'ops_manager'),
  ('f5000000-0000-4000-8000-0000000000b4'::uuid, 'rider_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- ------------------------------------------------------- NexG's own records

insert into public.guest (id, phone, name)
values ('f5000000-0000-4000-8000-0000000000c1', '+254700009500', '[Statement guest]');

/* Orders paid by M-PESA. Inserting an order already paid posts its sale to
   the ledger (order_posts_to_ledger); 9502's order was never marked paid. */
with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
   where m.city_id is not null order by m.id, b.id limit 1
), orders (id, reference, status) as (
  values
    ('f5000000-0000-4000-8000-000000000101'::uuid, 'NX-261118-9501', 'paid'),     -- receipt on the statement
    ('f5000000-0000-4000-8000-000000000102'::uuid, 'NX-261118-9502', 'pending'),  -- settled with no receipt
    ('f5000000-0000-4000-8000-000000000103'::uuid, 'NX-261118-9503', 'paid'),     -- not on the statement
    ('f5000000-0000-4000-8000-000000000105'::uuid, 'NX-261118-9505', 'paid')      -- a different amount
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'f5000000-0000-4000-8000-0000000000c1', m.merchant_id, m.branch_id,
  m.city_id, 'web', '[Fixture address]', 'placed'::public.order_stage,
  'mpesa_stk'::public.order_payment_method, o.status::public.order_payment_status,
  50000, 0, 0, 50000, 'KES'
from orders o cross join merchant_fixture m;

insert into public.payment (id, reference, intent, order_id, city_id, amount_cents, provider, channel,
  state, provider_ref, provider_receipt, payer_phone, paid_at, created_via)
select x.id, x.reference, x.intent::public.payment_intent, x.order_id,
       (select city_id from public.order where id = 'f5000000-0000-4000-8000-000000000101'),
       x.amount, 'mpesa', 'mpesa', 'paid', x.checkout, x.receipt, x.phone,
       now() - x.ago, 'guest_checkout'
  from (values
    ('f5000000-0000-4000-8000-000000000201'::uuid, 'PAY-STMT-9501', 'order',
     'f5000000-0000-4000-8000-000000000101'::uuid, 50000, 'ws_CO_STMT9501', 'SFT5RCPT01', '254700009501', interval '60 minutes'),
    ('f5000000-0000-4000-8000-000000000202'::uuid, 'PAY-STMT-9502', 'order',
     'f5000000-0000-4000-8000-000000000102'::uuid, 50000, 'ws_CO_STMT9502', null, '254700009502', interval '49 minutes'),
    ('f5000000-0000-4000-8000-000000000203'::uuid, 'PAY-STMT-9503', 'order',
     'f5000000-0000-4000-8000-000000000103'::uuid, 50000, 'ws_CO_STMT9503', 'SFT5RCPT03', '254700009503', interval '40 minutes'),
    ('f5000000-0000-4000-8000-000000000204'::uuid, 'PAY-STMT-9504', 'rider_float',
     null, 250000, 'ws_CO_STMT9504', null, '254700009504', interval '30 minutes'),
    ('f5000000-0000-4000-8000-000000000205'::uuid, 'PAY-STMT-9505', 'order',
     'f5000000-0000-4000-8000-000000000105'::uuid, 50000, 'ws_CO_STMT9505', 'SFT5RCPT05', '254700009505', interval '35 minutes')
  ) as x (id, reference, intent, order_id, amount, checkout, receipt, phone, ago);

/* 9502: the background status query settled it, and the query returns no receipt. */
insert into public.payment_prompt (payment_id, checkout_request_id, phone, sent_at, resolved_at,
  resolved_via, outcome, result_code)
values ('f5000000-0000-4000-8000-000000000202', 'ws_CO_STMT9502', '254700009502',
        now() - interval '50 minutes', now() - interval '49 minutes', 'query', 'paid', 0);

/* A Paybill payment for no order: it exists only as the message. */
insert into public.payment_event (payment_id, provider, event, dedupe_key, reference, payload,
  signature_ok, handled, received_at)
values (null, 'mpesa', 'mpesa.paybill', 'paybill:SFT5PBILL6', 'WRONGREF',
        '{"TransID": "SFT5PBILL6", "TransAmount": "700.00", "BillRefNumber": "WRONGREF", "MSISDN": "254700009506"}',
        true, false, now() - interval '20 minutes');

/* The statement, as the console reads it: rows 2 to 10 of the file. */
insert into t (k, v)
select 'lines', jsonb_agg(jsonb_build_object(
         'line_no', x.line_no, 'receipt', x.receipt,
         'completed_at', now() - x.ago, 'initiated_at', now() - x.ago,
         'details', x.details, 'other_party', x.party, 'phone_tail', x.tail,
         'account_ref', x.account, 'status_text', x.status, 'reason_type', x.reason,
         'direction', x.direction, 'amount_cents', x.amount, 'balance_cents', null,
         'linked_receipt', null, 'kind', x.kind,
         'raw', jsonb_build_array(x.receipt, x.details, x.party)) order by x.line_no)::text
  from (values
    (2, 'SFT5RCPT01', interval '60 minutes', 'Pay Bill Online from 254700009501 - TEST ONE Acc. NX2611189501',
     '254700009501 - TEST ONE', '501', 'NX2611189501', 'Completed', 'Pay Bill Online', 'in', 50000, 'collection'),
    (3, 'SFT5RCPT01', interval '60 minutes', 'Pay Bill Online from 254700009501 - TEST ONE Acc. NX2611189501',
     '254700009501 - TEST ONE', '501', 'NX2611189501', 'Completed', 'Pay Bill Online', 'in', 50000, 'collection'),
    (4, 'SFT5NORCP2', interval '49 minutes 30 seconds', 'Pay Bill Online from 254700009502 - TEST TWO Acc. NX2611189502',
     '254700009502 - TEST TWO', '502', 'NX2611189502', 'Completed', 'Pay Bill Online', 'in', 50000, 'collection'),
    (5, 'SFT5UNKN04', interval '28 minutes', 'Pay Bill Online from 254700009504 - TEST RIDER Acc. FLOAT',
     '254700009504 - TEST RIDER', '504', 'FLOAT', 'Completed', 'Pay Bill Online', 'in', 250000, 'collection'),
    (6, 'SFT5RCPT05', interval '35 minutes', 'Pay Bill Online from 254700009505 - TEST FIVE Acc. NX2611189505',
     '254700009505 - TEST FIVE', '505', 'NX2611189505', 'Completed', 'Pay Bill Online', 'in', 45000, 'collection'),
    (7, 'SFT5PBILL6', interval '20 minutes', 'Pay Bill from 254700009506 - TEST SIX Acc. WRONGREF',
     '254700009506 - TEST SIX', '506', 'WRONGREF', 'Completed', 'Pay Bill', 'in', 70000, 'collection'),
    (8, 'SFT5NOPE07', interval '15 minutes', 'Pay Bill from 600999 - SOME BUSINESS',
     '600999 - SOME BUSINESS', null, null, 'Completed', 'Pay Bill', 'in', 12300, 'collection'),
    (9, 'SFT5RCPT01', interval '60 minutes', 'Pay Bill Online Charge',
     null, null, null, 'Completed', 'Pay Bill Online Charge', 'out', 1500, 'charge'),
    (10, 'SFT5FAIL09', interval '10 minutes', 'Pay Bill Online from 254700009509 - TEST NINE',
     '254700009509 - TEST NINE', '509', null, 'Failed', 'Pay Bill Online', 'in', 10000, 'failed')
  ) as x (line_no, receipt, ago, details, party, tail, account, status, reason, direction, amount, kind);

insert into t (k, v) values
  ('path', 'f5000000-0000-4000-8000-0000000000a1/f5000000-0000-4000-8000-0000000000f1/Paybill_statement.csv'),
  ('other_path', 'f5000000-0000-4000-8000-0000000000a2/f5000000-0000-4000-8000-0000000000f2/Paybill_statement.csv'),
  ('sha', repeat('ab', 32)),
  ('from', ((now() at time zone 'Africa/Nairobi')::date - 1)::text),
  ('to', ((now() at time zone 'Africa/Nairobi')::date)::text);

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('fin_statement_import', 'fin_statement_line', 'fin_statement_match')
      and c.relrowsecurity),
  3,
  'All three statement tables have row-level security');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ~ '(fin_statement|fin_mask)'),
  0,
  'The wiring check finds nothing wrong with statement imports');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(finance\.statement_[a-z_]+)''', 'g') as m
     where p.proname like 'rpc\_fin\_statement\_%') used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action a statement function logs is in the audit registry');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'rpc\_fin\_statement\_%' or p.proname like 'fn\_fin\_statement\_%'
           or p.proname = 'fn_fin_mask_phones')
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'Signed-out visitors cannot execute any statement function');

select ok(
  not has_function_privilege('authenticated', 'public.fn_fin_statement_match(uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.fn_fin_statement_records(text, timestamptz, timestamptz, text[])', 'execute'),
  'Nobody calls the matcher or the records list directly');

select is(
  (select public::text || ' ' || file_size_limit::text || ' ' || ('text/csv' = any (allowed_mime_types))::text
     from storage.buckets where id = 'finance-statements'),
  'false 20971520 true',
  'Statements are kept in a private bucket of up to 20 MB per CSV file');

-- ------------------------------------------------------------------ the file

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('finance-statements', (select v from t where k = 'path'),
            'f5000000-0000-4000-8000-0000000000a1', '{"size": 2048}')$$,
  'Full Finance uploads a statement into its own folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('finance-statements', 'f5000000-0000-4000-8000-0000000000a2/x/stolen.csv',
            'f5000000-0000-4000-8000-0000000000a1', '{"size": 10}')$$,
  '42501', null,
  'but not into someone else''s');

select throws_ok(
  $$select public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100', current_date - 1, current_date,
      'f5000000-0000-4000-8000-0000000000a1/missing/statement.csv', 'statement.csv',
      repeat('ab', 32), 2048, 'mpesa', (select v::jsonb from t where k = 'lines'))$$,
  'P0002', 'The statement file did not arrive. Upload it again.',
  'An import refuses a file that is not in storage');

reset role;
/* A file in Finance Two's folder, as storage would hold it. */
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('finance-statements', (select v from t where k = 'other_path'),
        'f5000000-0000-4000-8000-0000000000a2', '{"size": 2048}');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100',
      (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
      (select v from t where k = 'other_path'), 'Paybill_statement.csv',
      repeat('ab', 32), 2048, 'mpesa', (select v::jsonb from t where k = 'lines'))$$,
  'P0002', 'The statement file did not arrive. Upload it again.',
  'or a file someone else uploaded');

select throws_ok(
  $$select public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100',
      (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
      (select v from t where k = 'path'), 'Paybill_statement.csv',
      repeat('ab', 32), 2048, 'bank', (select v::jsonb from t where k = 'lines'))$$,
  '22023', 'This file is not laid out like a statement from that source.',
  'A bank layout cannot be imported as an M-PESA statement');

select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('finance-statements', 'f5000000-0000-4000-8000-0000000000a3/x/statement.csv',
            'f5000000-0000-4000-8000-0000000000a3', '{"size": 10}')$$,
  '42501', null,
  'An ops manager, who views Finance, cannot upload a statement');

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'finance-statements' and name = (select v from t where k = 'path')),
  1,
  'but can read one');

select throws_ok(
  $$select public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100',
      (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
      (select v from t where k = 'path'), 'Paybill_statement.csv',
      repeat('ab', 32), 2048, 'mpesa', (select v::jsonb from t where k = 'lines'))$$,
  '42501', 'Only people with full Finance access can do this.',
  'nor import it');

select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'finance-statements'),
  0,
  'Staff outside Finance see no statement files');

-- ------------------------------------------------------------------ the import

select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t (k, v)
select 'import', public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100 · Utility',
  (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
  (select v from t where k = 'path'), 'Paybill_statement.csv',
  (select v from t where k = 'sha'), 2048, 'mpesa', (select v::jsonb from t where k = 'lines')) ->> 'id';

select is(
  (select (number ~ '^REC-[0-9]{4}-[0-9]{4,}$')::text || ' ' || status || ' ' || line_count || ' '
          || paid_in_cents || ' ' || withdrawn_cents
     from public.fin_statement_import where id = (select v::uuid from t where k = 'import')),
  'true open 9 527300 1500',
  'The import is numbered, open, and adds up its lines (a failed line moves no money)');

select is(
  (select result || ' ' || rule || ' ' || record_reference from line_result where line_no = 2),
  'matched receipt NX-261118-9501',
  'A receipt NexG recorded matches its payment');

select is(
  (select expected_ledger::text || ' ' || ledger_found::text from line_result where line_no = 2),
  'true true',
  'and the order''s sale is on the ledger');

select is(
  (select result from line_result where line_no = 3),
  'duplicate',
  'The same receipt, direction and amount printed twice is a duplicate');

select is(
  (select result || ' ' || rule || ' ' || record_reference || ' ' || ledger_found::text
     from line_result where line_no = 4),
  'matched account_amount_time NX-261118-9502 false',
  'A payment settled with no receipt matches by order number, amount and the time its prompt was open, and its missing sale shows');

select is(
  (select result || ' ' || rule || ' ' || record_id::text from line_result where line_no = 5),
  'suggested amount_phone_time f5000000-0000-4000-8000-000000000204',
  'Same amount, time and phone ending is only a suggestion');

select is(
  (select result || ' ' || difference_cents from line_result where line_no = 6),
  'amount_differs -5000',
  'A known receipt for a different amount differs, by the difference');

select is(
  (select result || ' ' || rule || ' ' || record_type from line_result where line_no = 7),
  'state_differs paybill_event paybill_event',
  'A Paybill payment nobody handled is on the statement but differs in state');

select is(
  (select result from line_result where line_no = 8),
  'not_in_nexg',
  'A receipt NexG has no record of is not in NexG');

select is(
  (select result || ' ' || expected_ledger::text from line_result where line_no = 9),
  'charge false',
  'A charge is a charge, not posted to the ledger by design');

select is(
  (select result from line_result where line_no = 10),
  'ignored',
  'A failed line is ignored');

select is(
  (select m.result from public.fin_statement_match m
    where m.import_id = (select v::uuid from t where k = 'import')
      and m.record_type = 'payment' and m.record_id = 'f5000000-0000-4000-8000-000000000203'),
  'not_on_statement',
  'A paid payment in the period with no line is not on the statement');

select is(
  (select other_party || ' | ' || details from line_result where line_no = 5),
  '···504 - TEST RIDER | Pay Bill Online from ···504 - TEST RIDER Acc. FLOAT',
  'Phone numbers are kept to their last three digits');

select throws_like(
  $$select public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100',
      (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
      (select v from t where k = 'path'), 'Paybill_statement.csv',
      (select v from t where k = 'sha'), 2048, 'mpesa', (select v::jsonb from t where k = 'lines'))$$,
  'This file was already imported as REC-%',
  'The same file is not imported twice');

-- ---------------------------------------------------------------- resolving

insert into t (k, v)
select 'differs_id', match_id::text from line_result where line_no = 6;

select throws_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 8), 'explain')$$,
  '22023', 'Add a note saying why.',
  'Explaining needs a note');

select throws_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 8), 'match',
      'payment', 'f5000000-0000-4000-8000-000000000203')$$,
  '22023', 'Add a note saying why.',
  'and so does matching by hand');

select lives_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 5), 'confirm')$$,
  'Finance confirms a suggestion');

select is(
  (select result || ' ' || (decided_at is not null)::text from line_result where line_no = 5),
  'matched true',
  'which makes it a decided match');

select ok(
  exists (select 1 from jsonb_array_elements(public.rpc_fin_statement_find(
            (select match_id from line_result where line_no = 8))) x
           where x ->> 'record_id' = 'f5000000-0000-4000-8000-000000000203'),
  'The Match search offers nearby records for a line');

select ok(
  (select count(*) from jsonb_array_elements(public.rpc_fin_statement_find(
            (select match_id from line_result where line_no = 8), 'pay-stmt-9503')) x) = 1,
  'and finds one by its reference');

select lives_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 8), 'match',
      'payment', 'f5000000-0000-4000-8000-000000000203', 'The customer paid 9503 in two parts')$$,
  'Finance matches a line to a record by hand, with a note');

select is(
  (select result || ' ' || rule || ' ' || difference_cents from line_result where line_no = 8),
  'matched manual -37700',
  'It is matched by hand, and the difference stays visible');

select is(
  (select count(*)::int from public.fin_statement_match m
    where m.import_id = (select v::uuid from t where k = 'import')
      and m.record_id = 'f5000000-0000-4000-8000-000000000203' and m.line_id is null),
  0,
  'and the record is no longer listed as missing from the statement');

select is(
  (select match_id::text || ' ' || result from line_result where line_no = 6),
  (select v from t where k = 'differs_id') || ' amount_differs',
  'Matching again keeps the ids of the items nobody decided');

select throws_like(
  $$select public.rpc_fin_statement_close((select v::uuid from t where k = 'import'))$$,
  '% still open. Match, confirm or explain each one first.',
  'A reconciliation with open items cannot be closed');

select lives_ok(
  $$select count(public.rpc_fin_statement_resolve(m.id, 'explain', null, null, 'Checked with Safaricom'))
      from public.fin_statement_match m
     where m.import_id = (select v::uuid from t where k = 'import') and m.decided_at is null
       and m.result in ('suggested', 'amount_differs', 'state_differs', 'not_in_nexg',
                        'not_on_statement', 'duplicate')$$,
  'Finance explains everything else');

select lives_ok(
  $$select public.rpc_fin_statement_close((select v::uuid from t where k = 'import'))$$,
  'and closes the reconciliation');

select is(
  (select status || ' ' || (closed_by = 'f5000000-0000-4000-8000-0000000000b1')::text
     from public.fin_statement_import where id = (select v::uuid from t where k = 'import')),
  'closed true',
  'It records who closed it');

select throws_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 6), 'explain',
      null, null, 'Late note')$$,
  '23514', 'This reconciliation is closed and can no longer change.',
  'A closed reconciliation does not change');

select throws_ok(
  $$select public.rpc_fin_statement_void((select v::uuid from t where k = 'import'), ' ')$$,
  '22023', 'Say why it is voided.',
  'Voiding needs a reason');

select lives_ok(
  $$select public.rpc_fin_statement_void((select v::uuid from t where k = 'import'), 'Wrong Paybill account')$$,
  'Finance voids an import');

select lives_ok(
  $$insert into t (k, v)
    select 'again', public.rpc_fin_statement_import('mpesa_paybill', 'Paybill 600100 · Utility',
      (select v::date from t where k = 'from'), (select v::date from t where k = 'to'),
      (select v from t where k = 'path'), 'Paybill_statement.csv',
      (select v from t where k = 'sha'), 2048, 'mpesa', (select v::jsonb from t where k = 'lines')) ->> 'number'$$,
  'and the same file can then be imported again');

-- ---------------------------------------------------------- who sees what

select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select ok(
  (select count(*) from public.fin_statement_line
    where import_id = (select v::uuid from t where k = 'import')) = 9
  and exists (select 1 from jsonb_array_elements(public.rpc_fin_statement_imports(current_date - 7, current_date)) x
               where x ->> 'id' = (select v from t where k = 'import') and x ->> 'status' = 'void'),
  'An ops manager, who views Finance, reads imports and their lines');

select is(
  (select jsonb_array_length(public.rpc_fin_statement_detail((select v::uuid from t where k = 'import')) -> 'items')
          >= 9),
  true,
  'and one import in detail, line by line');

select throws_ok(
  $$select public.rpc_fin_statement_resolve((select match_id from line_result where line_no = 6), 'explain',
      null, null, 'Ops note')$$,
  '42501', 'Only people with full Finance access can do this.',
  'but resolves nothing');

select set_config('request.jwt.claims',
  '{"sub":"f5000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.fin_statement_import)
  + (select count(*)::int from public.fin_statement_line)
  + (select count(*)::int from public.fin_statement_match),
  0,
  'Staff outside Finance see no imports, lines or matches');

select throws_ok(
  $$select public.rpc_fin_statement_detail((select v::uuid from t where k = 'import'))$$,
  '42501', 'Only people who reach Finance can see this.',
  'and cannot read one in detail');

select throws_ok(
  $$select public.rpc_fin_statement_imports(current_date - 7, current_date)$$,
  '42501', 'Only people who reach Finance can see this.',
  'or list them');

reset role;

-- ------------------------------------------------------------------ audit

select is(
  (select string_agg(distinct e.action, ', ' order by e.action) from audit.audit_event e
    where e.action like 'finance.statement\_%'
      and (e.target_id = (select v::uuid from t where k = 'import')
           or e.target_id in (select m.id from public.fin_statement_match m
                               where m.import_id = (select v::uuid from t where k = 'import')))),
  'finance.statement_closed, finance.statement_imported, finance.statement_item_explained, '
    || 'finance.statement_line_matched, finance.statement_suggestion_confirmed, finance.statement_voided',
  'Every change was audited');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'audit.unknown_action' and after ->> 'action' like 'finance.statement%'),
  0,
  'under registered actions');

select is(
  (select m.review_state::text from audit.audit_event e
     join audit.event_meta m on m.event_id = e.id
    where e.action = 'finance.statement_voided'
      and e.target_id = (select v::uuid from t where k = 'import')),
  'needs_review',
  'and voiding waits in the audit log for review');

select is(
  (select count(*)::int from public.fin_statement_import
    where file_sha256 = (select v from t where k = 'sha') and status = 'open'),
  1,
  'The second import of the file is open beside the voided one');

select * from finish();
rollback;
