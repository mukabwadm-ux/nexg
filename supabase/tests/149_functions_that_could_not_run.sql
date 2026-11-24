-- 20270227000400: seven functions that failed the moment they ran now run.
--
-- None of them had a test, which is how they reached production broken.
-- Each block below calls the function the way its feature does.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ═══════════════════════════════════════════════════════════ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '14800000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
        'staff148@test.local', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('14800000-0000-4000-8000-0000000000b1', '14800000-0000-4000-8000-0000000000a1', 'staff148@test.local', 'Staff 148');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '14800000-0000-4000-8000-0000000000b1', r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when r.key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from public.role r where r.key in ('recruiter', 'finance');

-- ═══════════════════════════════════════════ 1. a refund receipt's email

/* Stand-ins for the sender and the order details, so the test sees whether
   the refund branch reaches the sender at all. Before the fix its query
   failed ("p.id is ambiguous") and the error was swallowed. */
create or replace function app_email.send(p_key text, p_subject_type text, p_subject_id uuid, p_vars jsonb,
  p_user uuid default null, p_email text default null, p_event text default '')
returns uuid language sql as $$ select gen_random_uuid() $$;
create or replace function app_email.order_vars(p_order uuid)
returns jsonb language sql as $$ select '{}'::jsonb $$;

select is(
  app_email.for_receipt(jsonb_populate_record(null::public.receipt, jsonb_build_object(
    'id', gen_random_uuid(), 'number', 'RFD-148-1', 'kind', 'refund', 'party_type', 'guest',
    'source_type', 'refund', 'source_id', gen_random_uuid(), 'total_cents', 100000,
    'method', 'M-Pesa', 'issued_at', now(), 'lines', '[]'))),
  true,
  'A refund receipt reaches the email sender.');

-- ═══════════════════════════════════════════════════ 2–3. job offers

insert into hr.job (id, slug, title) values ('14800000-0000-4000-8000-0000000000c1', 'test-148', 'Test 148');
insert into hr.candidate (id, email) values
  ('14800000-0000-4000-8000-0000000000d1', 'cand148a@test.local'),
  ('14800000-0000-4000-8000-0000000000d2', 'cand148b@test.local');
insert into hr.application (id, job_id, candidate_id, status_token_hash, status_token_expires_at) values
  ('14800000-0000-4000-8000-0000000000e1', '14800000-0000-4000-8000-0000000000c1', '14800000-0000-4000-8000-0000000000d1',
   extensions.crypt('token-148-a', extensions.gen_salt('bf')), now() + interval '1 day'),
  ('14800000-0000-4000-8000-0000000000e2', '14800000-0000-4000-8000-0000000000c1', '14800000-0000-4000-8000-0000000000d2',
   null, null);
insert into hr.offer (id, application_id, status, salary, start_date) values
  ('14800000-0000-4000-8000-0000000000f1', '14800000-0000-4000-8000-0000000000e1', 'sent', 90000, date '2027-01-04'),
  ('14800000-0000-4000-8000-0000000000f2', '14800000-0000-4000-8000-0000000000e2', 'drafted', 900000000, date '2027-01-04');

/* The candidate answers on the careers status page, signed out. */
set local role anon;
select is(public.rpc_careers_respond_offer('token-148-a', true, null) ->> 'ok', 'true',
  'A candidate can accept an offer from the status page.');
reset role;

select is((select status::text from hr.offer where id = '14800000-0000-4000-8000-0000000000f1'), 'accepted',
  'The accepted offer is marked accepted.');

/* A recruiter approves a large offer: it waits for a second person. */
set local role authenticated;
set local request.jwt.claims = '{"sub":"14800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((hr.rpc_offer_approve('14800000-0000-4000-8000-0000000000e2')).status::text, 'awaiting_approval',
  'A recruiter''s approval of a large offer waits for a second approver.');

-- ═══════════════════════════════════════ 4. a hotel statement, reconciled

reset role;
insert into public.hotel (id, name) values ('14800000-0000-4000-8000-000000000101', 'Hotel 148');
insert into public.hotel_statement (id, hotel_id, period)
values ('14800000-0000-4000-8000-000000000102', '14800000-0000-4000-8000-000000000101', date '2026-11-01');

set local role authenticated;
set local request.jwt.claims = '{"sub":"14800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is(public.rpc_reconciliation_import('14800000-0000-4000-8000-000000000102',
            '[{"ref": "H148-1", "amount": "250000", "room": "12", "date": "2026-11-05"}]'::jsonb),
  1, 'Finance can import a hotel statement line.');
reset role;

select is((select status::text from public.folio_reconciliation where statement_id = '14800000-0000-4000-8000-000000000102'),
  'missing_reference', 'A line with no matching posting is marked missing_reference.');

-- ═══════════════════════════════════ 5. a connection disconnected, keys gone

create temp table t148 (secret_id uuid) on commit drop;
insert into t148 select vault.create_secret('secret-148', 'test-148-' || gen_random_uuid()::text);
insert into public.connector_connection (id, adapter_id, state)
values ('14800000-0000-4000-8000-000000000201', 'mock-supplier', 'degraded');
insert into public.connector_connection_secret (connection_id, name, vault_secret_id, fingerprint)
select '14800000-0000-4000-8000-000000000201', 'api_key', secret_id, 'fp-148' from t148;
grant select on t148 to service_role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.rpc_connector_transition('14800000-0000-4000-8000-000000000201', 'disconnected', 'test 148')::text,
  'disconnected', 'The connector service can disconnect a connection that holds a secret.');
reset role;

select is((select count(*)::integer from vault.secrets where id = (select secret_id from t148)), 0,
  'Disconnecting deletes the key from the vault.');
select is((select count(*)::integer from public.connector_connection_secret
            where connection_id = '14800000-0000-4000-8000-000000000201'), 0,
  'Disconnecting forgets which keys the connection had.');

-- ═══════════════════════════════════════════════ 6. the featured rollup

select lives_ok($$select public.fn_featured_rollup(current_date)$$,
  'The daily featured rollup runs.');
select ok(not has_function_privilege('authenticated', 'public.fn_featured_rollup(date)', 'execute')
          and has_function_privilege('service_role', 'public.fn_featured_rollup(date)', 'execute'),
  'Only service_role may run the featured rollup.');

-- ═══════════════════════════════════════════════ 7. a cash deposit, matched

insert into public.cash_deposit (id, provider_ref, msisdn, amount_kes)
values ('14800000-0000-4000-8000-000000000301', 'PB148TEST', '254799000148', 500);

select lives_ok($$select public.fn_match_deposit('14800000-0000-4000-8000-000000000301')$$,
  'Matching a cash deposit runs.');
select is((select match_status::text from public.cash_deposit where id = '14800000-0000-4000-8000-000000000301'),
  'unmatched', 'A deposit from a number no rider has stays unmatched.');

select * from finish();
rollback;
