-- Which device did what, and a merchant trail only staff can read
-- (20270131000200).

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ── fixtures

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status)
values ('c1310000-0000-4000-8000-00000000000a', '[Legal 131] Ltd', '[Shop 131]', 'restaurant',
        '[Contact]', '+254700013101', 'shop131@example.test',
        (select id from public.city where slug = 'nairobi'), 'documents_pending');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1310000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner131@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1310000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', 'customer131@example.test', now(), false, now(), now());

insert into public.merchant_user (merchant_id, user_id, role)
values ('c1310000-0000-4000-8000-00000000000a', 'c1310000-0000-4000-8000-000000000101', 'owner');

insert into public.catalogue_section (id, merchant_id, name)
values ('c1310000-0000-4000-8000-0000000000c1', 'c1310000-0000-4000-8000-00000000000a', '[Mains 131]');

-- ── reading the request

select is(audit.fn_device_label(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'),
  'Chrome · Windows', 'A Chrome user agent on Windows reads as Chrome · Windows.');
select is(audit.fn_device_label(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'),
  'Safari · iPhone', 'Safari on an iPhone reads as Safari · iPhone.');
select is(audit.fn_inet('not an address'), null, 'A value that is not an address is dropped, not raised.');

select set_config('request.headers', json_build_object(
  'x-forwarded-for', '203.0.113.9, 10.0.0.1',
  'x-nexg-client-ip', '198.51.100.7',
  'x-nexg-client-ua', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/131.0',
  'x-nexg-device', 'abcdef0123456789abcdef0123456789',
  'x-nexg-surface', 'web')::text, true);
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000101","role":"authenticated","session_id":"5e55a000-0000-4000-8000-000000000001"}',
  true);

select is(audit.fn_request_context() ->> 'ip', '198.51.100.7',
  'The address our server forwarded wins over the gateway''s.');
select is(audit.fn_request_context() ->> 'proxy_ip', '203.0.113.9',
  'The gateway-seen address is kept beside it.');
select is(audit.fn_request_context() ->> 'device_label', 'Firefox · macOS',
  'The forwarded user agent is the one labelled.');
select is(audit.fn_request_context() ->> 'session_id', '5e55a000-0000-4000-8000-000000000001',
  'The session is the JWT''s.');

select set_config('request.headers', json_build_object(
  'x-nexg-device', 'bad id; drop table', 'user-agent', 'curl/8.0')::text, true);
select is(audit.fn_request_context() ->> 'device_id', null, 'A malformed device id is ignored.');
select is(audit.fn_request_context() ->> 'device_label', 'Script · Other',
  'Without a forwarded user agent the request''s own is used.');

-- ── a merchant user's direct writes are recorded, with where they came from

select set_config('request.headers', json_build_object(
  'x-nexg-client-ip', '198.51.100.7',
  'x-nexg-client-ua', 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0',
  'x-nexg-device', 'abcdef0123456789abcdef0123456789')::text, true);

set local role authenticated;

update public.catalogue_section set name = '[Starters 131]'
 where id = 'c1310000-0000-4000-8000-0000000000c1';

reset role;

select is(
  (select count(*)::int from audit.event_origin o join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a'
      and e.action = 'merchant.record_changed' and e.target_type = 'catalogue_section'),
  1, 'Renaming a section through the API writes one event.');
select is(
  (select e.after ->> 'name' from audit.event_origin o join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a' and e.action = 'merchant.record_changed'),
  '[Starters 131]', 'It records the new value of the field that changed.');
select ok(
  (select not (e.after ? 'merchant_id') from audit.event_origin o join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a' and e.action = 'merchant.record_changed'),
  'And only the fields that changed.');
select is(
  (select host(o.ip) || ' · ' || o.device_label || ' · ' || o.device_id from audit.event_origin o
    join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a' and e.action = 'merchant.record_changed'),
  '198.51.100.7 · Chrome · Windows · abcdef0123456789abcdef0123456789',
  'With the address, device label and device id.');
select is(
  (select e.ip from audit.event_origin o join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a' and e.action = 'merchant.record_changed'),
  null, 'The address stays out of the hash chain.');
select is(
  (select e.session_id from audit.event_origin o join audit.audit_event e on e.id = o.event_id
    where o.merchant_id = 'c1310000-0000-4000-8000-00000000000a' and e.action = 'merchant.record_changed'),
  '5e55a000-0000-4000-8000-000000000001', 'The session id does go on the chained row.');

set local role authenticated;
update public.catalogue_section set name = name
 where id = 'c1310000-0000-4000-8000-0000000000c1';
reset role;
select is(
  (select count(*)::int from audit.event_origin where merchant_id = 'c1310000-0000-4000-8000-00000000000a'),
  1, 'An update that changes nothing writes nothing.');

-- Somebody who is not on the team (a customer) leaves no merchant trail.
-- Written as postgres so RLS does not refuse it first.
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000102","role":"authenticated"}', true);
update public.catalogue_section set name = '[By postgres 131]'
 where id = 'c1310000-0000-4000-8000-0000000000c1';
select is(
  (select count(*)::int from audit.event_origin where merchant_id = 'c1310000-0000-4000-8000-00000000000a'),
  1, 'A write by someone outside the merchant''s team is not logged as theirs.');

-- ── who can read it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000101","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.rpc_admin_merchant_activity('c1310000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'The merchant cannot read their own trail.');
select throws_ok($$select * from public.rpc_audit_devices()$$, '42501', null,
  'Nor the device list.');
select is((select count(*)::int from public.audit_activity_v where device_id is not null), 0,
  'And the Activity view shows them no origins.');
reset role;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select su.user_id from public.staff_user su
            join public.role_grant rg on rg.staff_user_id = su.id and rg.revoked_at is null
            join public.role r on r.id = rg.role_id and r.key = 'super_admin'
           where su.status = 'active' limit 1),
  'role', 'authenticated', 'session_id', '5e55a000-0000-4000-8000-0000000000aa')::text, true);
set local role authenticated;

select is(
  (select who || ' · ' || who_role || ' · ' || ip || ' · ' || device_label
     from public.rpc_admin_merchant_activity('c1310000-0000-4000-8000-00000000000a') limit 1),
  'owner131@example.test · owner · 198.51.100.7 · Chrome · Windows',
  'A super admin sees who on the team did it, from where.');

-- A staff sign-in from this device, then the device list.
select lives_ok($$select public.rpc_record_sign_in(
  (select email from public.staff_user where user_id = auth.uid()), 'success')$$,
  'A staff sign-in records.');
select is(
  (select host(ip) || ' · ' || device_fingerprint || ' · ' || session_id from audit.sign_in
    order by id desc limit 1),
  '198.51.100.7 · abcdef0123456789abcdef0123456789 · 5e55a000-0000-4000-8000-0000000000aa',
  'With the address, device id and session from the request.');
select ok(
  (select sign_ins >= 1 from public.rpc_audit_devices()
    where device_id = 'abcdef0123456789abcdef0123456789'),
  'And the device appears in the device list.');

reset role;

select * from finish();
rollback;
