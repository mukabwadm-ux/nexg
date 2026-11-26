-- Host document expiry (20270332000300): staff and hosts set the date under
-- their rules, an expired required document makes the host non-compliant,
-- the Verification reader's Expiring tab lists the host, and the daily
-- notices are sent once.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2500000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stranger250@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2500000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops250@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2500000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'approver250@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2500000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'owner250@example.test', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2500000-0000-4000-8000-0000000000b1', 'c2500000-0000-4000-8000-000000000002', 'ops250@test.local', 'Ops 250'),
  ('c2500000-0000-4000-8000-0000000000b2', 'c2500000-0000-4000-8000-000000000003', 'approver250@test.local', 'Approver 250');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2500000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2500000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at, verified_at)
values
  ('c2500000-0000-4000-8000-0000000000a1', '+254700025001', 'single_unit', 'live', 'Owner 250',
   '[Host 250]', 'host250@example.test', (select id from public.city where slug = 'nairobi'), now(), now()),
  ('c2500000-0000-4000-8000-0000000000a2', '+254700025002', 'single_unit', 'live', 'Other 250',
   '[Host 250b]', 'host250b@example.test', (select id from public.city where slug = 'nairobi'), now(), now());
insert into public.host_user (host_id, user_id, role)
values ('c2500000-0000-4000-8000-0000000000a1', 'c2500000-0000-4000-8000-000000000004', 'owner');

insert into public.host_document (id, host_id, kind, storage_path, file_name, mime, size_bytes, status, uploaded_by, expires_on)
values
  ('c2500000-0000-4000-8000-0000000000d1', 'c2500000-0000-4000-8000-0000000000a1', 'id_document',
   'host/c2500000-0000-4000-8000-0000000000a1/id_document/250-1.pdf', 'id.pdf', 'application/pdf', 1000, 'approved',
   'c2500000-0000-4000-8000-000000000004', null),
  ('c2500000-0000-4000-8000-0000000000d2', 'c2500000-0000-4000-8000-0000000000a1', 'authority',
   'host/c2500000-0000-4000-8000-0000000000a1/authority/250-2.pdf', 'lease.pdf', 'application/pdf', 1000, 'approved',
   'c2500000-0000-4000-8000-000000000004', (now() at time zone 'Africa/Nairobi')::date - 1),
  ('c2500000-0000-4000-8000-0000000000d3', 'c2500000-0000-4000-8000-0000000000a1', 'kra_pin',
   'host/c2500000-0000-4000-8000-0000000000a1/kra_pin/250-3.pdf', 'kra.pdf', 'application/pdf', 1000, 'uploaded',
   'c2500000-0000-4000-8000-000000000004', null),
  ('c2500000-0000-4000-8000-0000000000d4', 'c2500000-0000-4000-8000-0000000000a2', 'id_document',
   'host/c2500000-0000-4000-8000-0000000000a2/id_document/250-4.pdf', 'id.pdf', 'application/pdf', 1000, 'approved',
   'c2500000-0000-4000-8000-000000000004', (now() at time zone 'Africa/Nairobi')::date + 400),
  ('c2500000-0000-4000-8000-0000000000d5', 'c2500000-0000-4000-8000-0000000000a2', 'authority',
   'host/c2500000-0000-4000-8000-0000000000a2/authority/250-5.pdf', 'deed.pdf', 'application/pdf', 1000, 'approved',
   'c2500000-0000-4000-8000-000000000004', null);

-- ─────────────────────────────────────────── who may set the date

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d3', current_date + 100) $$,
  '42501', null, 'a stranger cannot set an expiry date');

select set_config('request.jwt.claims', '{"sub":"c2500000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d3',
          (now() at time zone 'Africa/Nairobi')::date + 200)).expires_on,
  (now() at time zone 'Africa/Nairobi')::date + 200, 'the host enters a date on a document not yet approved');
select throws_ok($$ select public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d3', current_date - 3) $$,
  '22023', null, 'but not a date already past');
select throws_ok($$ select public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d1', current_date + 90) $$,
  '22023', null, 'and not on a document NexG approved');
select is((public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d3', null)).expires_on,
  null::date, 'the host can clear their own date');

select set_config('request.jwt.claims', '{"sub":"c2500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d1',
          (now() at time zone 'Africa/Nairobi')::date + 20)).expires_on,
  (now() at time zone 'Africa/Nairobi')::date + 20, 'staff set the date on an approved ID');
select is((public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d5', current_date + 30)).expires_on,
  current_date + 30, 'staff set a date on another host');
select is((public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d5', null)).expires_on,
  null::date, 'and clear it again');
select throws_ok($$ select public.rpc_host_document_set_expiry('c2500000-0000-4000-8000-0000000000d1', date '1990-01-01') $$,
  '22023', null, 'a date from long ago is refused');

reset role;
select is((select count(*)::int from audit.audit_event e
            where e.action = 'host.document_expiry_set'
              and e.target_id in ('c2500000-0000-4000-8000-0000000000a1', 'c2500000-0000-4000-8000-0000000000a2')),
  5, 'each change is audited');

-- ─────────────────────────────────────────── compliance and the reader

select is(public.fn_host_document_expiry_state('approved', null, (now() at time zone 'Africa/Nairobi')::date - 1),
  'expired', 'a date before today is expired');
select is(public.fn_host_document_expiry_state('approved', null, (now() at time zone 'Africa/Nairobi')::date + 60),
  'expiring', 'within 60 days is expiring');
select is(public.fn_host_document_expiry_state('approved', null, (now() at time zone 'Africa/Nairobi')::date + 61),
  'valid', 'later is valid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2500000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select r ->> 'authority_ok' from jsonb_array_elements(public.rpc_console_stays_hosts('all', '[Host 250]', 1, 500) -> 'rows') r
            where r ->> 'host_id' = 'c2500000-0000-4000-8000-0000000000a1'),
  'false', 'an expired proof of authority is not ok');
select ok(exists (select 1 from jsonb_array_elements(public.rpc_console_stays_hosts('non_compliant', null, 1, 500) -> 'rows') r
                  where r ->> 'host_id' = 'c2500000-0000-4000-8000-0000000000a1'),
  'so the live host is non-compliant');
select is((select (r ->> 'docs_expired') || '/' || (r ->> 'docs_expiring') || '/' || (r ->> 'earliest_expiry')
             from jsonb_array_elements(public.rpc_console_stays_hosts('expiring', null, 1, 500) -> 'rows') r
            where r ->> 'host_id' = 'c2500000-0000-4000-8000-0000000000a1'),
  '1/1/' || ((now() at time zone 'Africa/Nairobi')::date - 1)::text,
  'the Expiring tab lists the host with one expired, one expiring and the earliest date');
select ok(not exists (select 1 from jsonb_array_elements(public.rpc_console_stays_hosts('expiring', null, 1, 500) -> 'rows') r
                      where r ->> 'host_id' = 'c2500000-0000-4000-8000-0000000000a2'),
  'a host whose documents are far from expiry is not listed');
select ok((public.rpc_console_stays_hosts('expiring') -> 'counts' ->> 'expiring')::int >= 1, 'and the tab is counted');
select is((select jsonb_array_length(r -> 'documents')
             from jsonb_array_elements(public.rpc_console_stays_hosts('all', '[Host 250]', 1, 500) -> 'rows') r
            where r ->> 'host_id' = 'c2500000-0000-4000-8000-0000000000a1'),
  3, 'each row lists its current documents');

-- ─────────────────────────────────────────── notices are sent once

reset role;
select public.cron_host_document_expiry_notices();
select is((select count(*)::int from public.notification_log
            where recipient = 'host250@example.test' and template in ('host_document_expiring', 'host_document_expired')),
  2, 'the cron emails the host about the expiring ID and the expired authority');
select public.cron_host_document_expiry_notices();
select is((select count(*)::int from public.notification_log
            where recipient = 'host250@example.test' and template in ('host_document_expiring', 'host_document_expired')),
  2, 'and sends nothing again the next day');
select is((select count(*)::int from public.host_document_expiry_notice n
            join public.host_document d on d.id = n.document_id
            where d.host_id = 'c2500000-0000-4000-8000-0000000000a2'),
  0, 'nothing for a document far from expiry');

select * from finish();
rollback;
