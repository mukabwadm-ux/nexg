-- Order events (20270101000100): a merchant's owner adds signed endpoints;
-- booking events are written at commit, follow the shared status, and go
-- only to endpoints of the right environment; the dispatcher signs what it
-- sends with the endpoint's Vault secret, and retries until 2xx or eight
-- attempts. pg_net never runs here: the test reads what it queued and
-- writes the answers itself.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and m.explore_visible and m.deleted_at is null
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;
grant select on t_m to authenticated;
grant select, insert on t to authenticated;

insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.venue_booking', 'fees', 'city', 'money', 'KES', 'Venue booking, flat')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.venue_booking', 'city', city_id, to_jsonb(15000), 'active',
       now() - interval '1 minute', 'order webhooks'
from t_m;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select id, encode(sha256(convert_to('hooks-live-key-0000000000000000000', 'UTF8')), 'hex'),
       'hookslv1', '{public_read,merchant_read,merchant_write}', 600
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_hooks-key-0000000000000000', 'UTF8')), 'hex'),
       'nexg_test_hoo1', '{public_read,merchant_read,merchant_write}', 600, 'test'
from t_m;

-- ═══════════════════════════════════════════════════════════════ addresses

select ok(
  (select bool_and(public.fn_api_webhook_url_ok(u)) from unnest(array[
    'https://hooks.partner.co.ke/nexg/events',
    'https://api.example.com:443/webhooks?source=nexg',
    'https://a1.events-service.io/x']) u),
  'https addresses on public hosts are accepted');

select ok(
  (select not bool_or(public.fn_api_webhook_url_ok(u)) from unnest(array[
    'http://hooks.partner.co.ke/nexg',
    'https://10.0.0.1/hooks',
    'https://127.0.0.1/hooks',
    'https://2130706433/hooks',
    'https://0x7f.0.0.1/hooks',
    'https://[::1]/hooks',
    'https://localhost/hooks',
    'https://intranet/hooks',
    'https://hooks.internal/x',
    'https://metadata.google.internal/computeMetadata',
    'https://box.local/x',
    'https://user:pass@hooks.partner.co.ke/x',
    'https://hooks.partner.co.ke:8443/x',
    'https://hooks.partner.co.ke/a b']) u),
  'plain http, IP addresses, private names, credentials and odd ports are refused');

-- ═══════════════════════════════════════════════════════════════ the owner adds endpoints

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'webhooks.owner@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
select id, 'c9100000-0000-4000-8000-000000000001', 'owner' from t_m;
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('c9200000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('c9200000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001', now());

select set_config('request.jwt.claims',
  '{"sub":"c9100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"c9200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

insert into t values ('live', public.rpc_api_webhook_endpoint_create(
  (select id from t_m), 'https://hooks.partner.co.ke/nexg/live', 'live', 'Back office'));

select ok(
  (select (v ->> 'secret') ~ '^whsec_[0-9a-f]{64}$' and v ->> 'secret_prefix' = left(v ->> 'secret', 12)
   from t where k = 'live'),
  'the owner adds a live endpoint and sees its signing secret once');

select lives_ok(
  $$insert into t values ('test', public.rpc_api_webhook_endpoint_create(
      (select id from t_m), 'https://hooks.partner.co.ke/nexg/test', 'test'))$$,
  'and a test endpoint');

select throws_ok(
  $$select public.rpc_api_webhook_endpoint_create(
      (select id from t_m), 'http://hooks.partner.co.ke/nexg', 'live')$$,
  '22023',
  'Use an https address on a public host, such as https://example.com/nexg/events.',
  'an address that is not https on a public host is refused');

select throws_ok(
  $$select public.rpc_api_webhook_endpoint_create(
      (select id from t_m), 'https://hooks.partner.co.ke/nexg/live', 'live')$$,
  '23505',
  'That address is already an endpoint.',
  'the same address is not added twice');

select throws_ok(
  $$select public.rpc_api_webhook_endpoint_create(
      (select m.id from public.merchant m where m.id <> (select id from t_m) order by m.id limit 1),
      'https://hooks.partner.co.ke/nexg/other', 'live')$$,
  '42501',
  'Only the merchant''s owner can add its webhook endpoints.',
  'nobody adds endpoints for a merchant they do not own');

select is(
  (select jsonb_array_length(list) || '|' || (list::text like '%whsec_%' and list::text !~ 'whsec_[0-9a-f]{64}')::text
   from (select public.rpc_api_webhook_endpoints() as list) x),
  '2|true',
  'the owner''s list shows both endpoints, with the secret''s first characters only');

reset role;

select is(
  (select ds.decrypted_secret from vault.decrypted_secrets ds
   where ds.name = 'api_webhook:' || (select v ->> 'id' from t where k = 'live')),
  (select v ->> 'secret' from t where k = 'live'),
  'Vault holds the signing secret; the row holds only its name');

-- ═══════════════════════════════════════════════════════════════ events

set constraints api_webhook_order_event immediate;

insert into t values ('booking', public.rpc_order_place_api(
  'hooks-live-key-0000000000000000000', 'hooks-idem-0000000000000001',
  '{"service":"venue_booking","quantity":3}'::jsonb));

select is(
  (select ev.body #>> '{data,booking,reference}' || '|' || (ev.body #>> '{data,booking,status}')
     || '|' || ev.environment
   from public.api_webhook_event ev
   where ev.type = 'booking.created'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')),
  (select v ->> 'reference' from t where k = 'booking') || '|requested|live',
  'a new booking writes booking.created, with the booking as a read returns it');

select is(
  (select string_agg(d.endpoint_id::text, ',')
   from public.api_webhook_delivery d
   join public.api_webhook_event ev on ev.id = d.event_id
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')),
  (select v ->> 'id' from t where k = 'live'),
  'it goes to the live endpoint only');

update public.order set stage = 'confirmed'
where id = (select (v ->> 'order_id')::uuid from t where k = 'booking');

select is(
  (select ev.body #>> '{data,previous_status}' || '>' || (ev.body #>> '{data,booking,status}')
   from public.api_webhook_event ev
   where ev.type = 'booking.status_changed'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')),
  'requested>confirmed',
  'a status change writes booking.status_changed with the status before and after');

update public.order set stage = 'preparing'
where id = (select (v ->> 'order_id')::uuid from t where k = 'booking');

select is(
  (select string_agg(ev.type || ':' || coalesce(ev.body #>> '{data,previous_stage}', '-')
                     || '>' || (ev.body #>> '{data,booking,stage}'), ',' order by ev.created_at)
   from public.api_webhook_event ev
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')),
  'booking.created:->placed,booking.status_changed:placed>confirmed,booking.stage_changed:confirmed>preparing',
  'a stage change inside the same status writes booking.stage_changed (20270105030100), not a status change');

insert into t values ('sandbox', public.rpc_order_place_api_test(
  'nexg_test_hooks-key-0000000000000000', 'hooks-idem-0000000000000002',
  '{"service":"venue_booking","quantity":1}'::jsonb));

select is(
  (select ev.environment || '|' || (ev.body #>> '{data,booking,reference}' like 'TEST-%')::text
     || '|' || (select string_agg(d.endpoint_id::text, ',') from public.api_webhook_delivery d
                where d.event_id = ev.id)
   from public.api_webhook_event ev
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'sandbox')),
  'test|true|' || (select v ->> 'id' from t where k = 'test'),
  'a sandbox booking writes a test event, for test endpoints only');

-- ═══════════════════════════════════════════════════════════════ test events

set local role authenticated;
insert into t values ('ping', to_jsonb(public.rpc_api_webhook_ping(
  (select (v ->> 'id')::uuid from t where k = 'live'))));
select throws_ok(
  $$select public.rpc_api_webhook_ping((select (v ->> 'id')::uuid from t where k = 'live'))$$,
  '22023',
  'A test event was just sent. Wait a few seconds.',
  'test events cannot be sent back to back');
reset role;

select is(
  (select ev.type || '|' || (select count(*) from public.api_webhook_delivery d where d.event_id = ev.id)
   from public.api_webhook_event ev
   where ev.id = (select (v #>> '{}')::uuid from t where k = 'ping')),
  'ping|1',
  'a test event goes to the one endpoint it was sent to');

-- ═══════════════════════════════════════════════════════════════ sending

insert into t values ('dispatch', public.fn_api_webhook_dispatch());

select is(
  (select count(*) from public.api_webhook_delivery d
   where d.state = 'sending' and d.attempts = 1 and d.request_id is not null),
  (select count(*) from public.api_webhook_delivery),
  'every due delivery is sent once, with a request in flight');

create temp table t_sent on commit drop as
  select d.id as delivery_id, d.request_id, d.endpoint_id, ev.id as event_id, ev.type, ev.body,
         q.headers, q.body as sent_body, q.url, q.method
  from public.api_webhook_delivery d
  join public.api_webhook_event ev on ev.id = d.event_id
  join net.http_request_queue q on q.id = d.request_id
  where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')
    and ev.type = 'booking.created';

select is(
  (select convert_from(s.sent_body, 'UTF8') = s.body::text and s.method = 'POST'
            and s.url = 'https://hooks.partner.co.ke/nexg/live'
   from t_sent s),
  true,
  'the body sent is the event exactly as stored, posted to the endpoint');

select is(
  (select encode(extensions.hmac(
            split_part(split_part(s.headers ->> 'NexG-Signature', ',', 1), '=', 2)
              || '.' || convert_from(s.sent_body, 'UTF8'),
            (select ds.decrypted_secret from vault.decrypted_secrets ds
             where ds.name = 'api_webhook:' || s.endpoint_id::text),
            'sha256'), 'hex')
   from t_sent s),
  (select split_part(split_part(s.headers ->> 'NexG-Signature', ',', 2), '=', 2) from t_sent s),
  'the signature verifies with the endpoint''s secret, over t and the body sent');

select is(
  (select (s.headers ->> 'NexG-Event-Id') || '|' || (s.headers ->> 'NexG-Event-Type') || '|'
     || (s.headers ->> 'NexG-Environment') || '|' || (s.headers ->> 'Content-Type')
   from t_sent s),
  (select s.event_id::text from t_sent s) || '|booking.created|live|application/json',
  'the headers name the event, its type and its environment');

-- The endpoint answers: 200 to booking.created, 500 to booking.status_changed.
insert into net._http_response (id, status_code, content, created)
select s.request_id, 200, 'ok', now() from t_sent s;
insert into net._http_response (id, status_code, content, created)
select d.request_id, 500, 'busy', now()
from public.api_webhook_delivery d
join public.api_webhook_event ev on ev.id = d.event_id
where ev.type = 'booking.status_changed';

select lives_ok($$select public.fn_api_webhook_dispatch()$$, 'the dispatcher reads the answers');

select is(
  (select d.state || '|' || d.last_status_code
   from public.api_webhook_delivery d where d.id = (select delivery_id from t_sent)),
  'delivered|200',
  'a 2xx answer marks the delivery delivered');

select is(
  (select d.state || '|' || d.attempts || '|' || d.last_error || '|'
     || (d.next_attempt_at = now() + interval '1 minute')::text
   from public.api_webhook_delivery d
   join public.api_webhook_event ev on ev.id = d.event_id
   where ev.type = 'booking.status_changed'),
  'queued|1|Answered 500.|true',
  'any other answer is tried again a minute later');

-- The eighth attempt fails too.
update public.api_webhook_delivery d
   set state = 'sending', attempts = 8, request_id = 990000001, sent_at = now()
  from public.api_webhook_event ev
 where ev.id = d.event_id and ev.type = 'booking.status_changed';
insert into net._http_response (id, status_code, content, created)
values (990000001, 503, 'down', now());
select public.fn_api_webhook_dispatch();

select is(
  (select d.state from public.api_webhook_delivery d
   join public.api_webhook_event ev on ev.id = d.event_id
   where ev.type = 'booking.status_changed'),
  'failed',
  'after eight attempts a delivery is failed for good');

-- ═══════════════════════════════════════════════════════════════ managing them

update public.order set stage = 'picked_up'
where id = (select (v ->> 'order_id')::uuid from t where k = 'booking');

set local role authenticated;
select public.rpc_api_webhook_endpoint_set_enabled((select (v ->> 'id')::uuid from t where k = 'live'), false);
reset role;

select is(
  (select d.state || '|' || d.last_error
   from public.api_webhook_delivery d
   join public.api_webhook_event ev on ev.id = d.event_id
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'booking')
     and ev.body #>> '{data,booking,status}' = 'in_progress'),
  'failed|The endpoint was switched off.',
  'switching an endpoint off drops what was waiting for it');

set local role authenticated;
insert into t values ('deliveries',
  public.rpc_api_webhook_deliveries((select (v ->> 'id')::uuid from t where k = 'live')));
reset role;

select is(
  (select jsonb_array_length(v) from t where k = 'deliveries'),
  (select count(*)::integer from public.api_webhook_delivery d
   where d.endpoint_id = (select (v ->> 'id')::uuid from t where k = 'live')),
  'the owner can read the endpoint''s deliveries');

set local role authenticated;
select public.rpc_api_webhook_endpoint_delete((select (v ->> 'id')::uuid from t where k = 'live'));
reset role;

select is(
  (select count(*) from public.api_webhook_endpoint where id = (select (v ->> 'id')::uuid from t where k = 'live'))
  + (select count(*) from public.api_webhook_delivery where endpoint_id = (select (v ->> 'id')::uuid from t where k = 'live'))
  + (select count(*) from vault.secrets where name = 'api_webhook:' || (select v ->> 'id' from t where k = 'live')),
  0::bigint,
  'deleting an endpoint removes it, its deliveries and its secret');

-- ═══════════════════════════════════════════════════════════════ who may call what

select ok(
  (select not bool_or(has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'rpc_api_webhook%' or p.proname like 'fn_api_webhook%'
     or p.proname in ('fn_api_order_object', 'fn_api_test_order_object')))
  and not has_function_privilege('authenticated', 'public.fn_api_webhook_dispatch()', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_webhook_enqueue(uuid, text, text, uuid, jsonb, uuid)', 'execute'),
  'nothing here is open to the public, and only the server runs the dispatcher');

select ok(
  not exists (select 1 from pg_extension where extname = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'api-webhooks' and schedule = '* * * * *'),
  'the dispatcher runs every minute');

select * from finish();
rollback;
