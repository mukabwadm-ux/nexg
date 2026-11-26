-- Communications & Automations (20270331000100): readers and writers are
-- staff-only, the tables are closed, marketing goes only to people who said
-- yes, a bulk send must match its preview, suppression and the opt-out link
-- work, and the outbox follows the retry settings.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'stranger248@example.test', now(), false, now(), now());

insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at)
values ('c2480000-0000-4000-8000-0000000000a1', '+254700024801', 'single_unit', 'paused', 'Amina 248',
        '[Host 248]', 'host248@example.test', (select id from public.city where slug = 'nairobi'), now());

create temporary table t248 (k text primary key, v jsonb) on commit drop;
grant all on t248 to authenticated, anon;

-- ─────────────────────────────────────────── strangers are refused

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_comms_overview(current_date - 7, current_date) $$, '42501', null,
  'a stranger cannot read the overview');
select throws_ok($$ select public.rpc_comms_manual_send('{"recipient":"+254700000000","channels":["sms"],"body":"x"}') $$,
  '42501', null, 'nor send a message');
select throws_ok($$ select count(*) from public.comms_consent $$, '42501', null, 'comms_consent is closed to direct reads');
select throws_ok($$ select count(*) from public.notification_outbox $$, '42501', null, 'and the outbox stays sealed');

-- ─────────────────────────────────────────── staff

-- dev.admin@nexgapp.com, the seeded super admin.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(public.rpc_comms_overview(current_date - 30, current_date) ? 'kpis', 'the overview reads');
select ok(public.rpc_comms_logs(current_date - 30, current_date) ? 'rows', 'the delivery logs read');

insert into t248 values ('before', public.rpc_comms_campaign_preview(
  '{"audiences":["hosts"],"channels":["email"],"subject":"Hi","body":"Hello {{first_name}}"}'));

select ok(public.rpc_comms_consent_record(jsonb_build_object('address', 'HOST248@example.test', 'audience', 'hosts',
  'kind', 'marketing', 'channel', 'all', 'granted', true, 'source', 'staff', 'evidence', 'Call, test 248')) ? 'id',
  'staff record a yes, with how it was given');

insert into t248 values ('after', public.rpc_comms_campaign_preview(
  '{"audiences":["hosts"],"channels":["email"],"subject":"Hi","body":"Hello {{first_name}}"}'));

select is(((select v from t248 where k = 'after') ->> 'reachable')::int,
          ((select v from t248 where k = 'before') ->> 'reachable')::int + 1,
  'the host is reachable only once they said yes');

select is(public.rpc_comms_campaign_send(jsonb_build_object('name', 'Test 248', 'audiences', array['hosts'],
  'channels', array['email'], 'subject', 'Hi', 'body', 'Hello {{first_name}}', 'confirm_reachable', 99999)) ->> 'changed',
  'true', 'a send that does not match its preview is refused and says so');

select is(public.rpc_comms_campaign_send(jsonb_build_object('name', 'Test 248', 'audiences', array['hosts'],
  'channels', array['email'], 'subject', 'Hi', 'body', 'Hello {{first_name}}',
  'confirm_reachable', ((select v from t248 where k = 'after') ->> 'reachable')::int)) ->> 'ok',
  'true', 'a confirmed send goes out');

reset role;
select ok((select o.body like 'Hello Amina%/u/%' from public.notification_outbox o
            where o.recipient = 'host248@example.test' and o.template like 'comms.%'),
  'the email is filled for the person and carries an opt-out link');
insert into t248 values ('token', to_jsonb((select token from public.comms_unsubscribe where email = 'host248@example.test' limit 1)));

set local role authenticated;
select ok(public.rpc_comms_suppression_add('email', 'host248@example.test', 'bounced', 'test') ->> 'ok' = 'true',
  'an address goes on the email suppression list');
select is((public.rpc_comms_campaign_preview(
  '{"audiences":["hosts"],"channels":["email"],"subject":"Hi","body":"Hello"}') ->> 'reachable')::int,
  ((select v from t248 where k = 'before') ->> 'reachable')::int,
  'a suppressed address is left out');
select is(public.rpc_comms_manual_send('{"recipient":"host248@example.test","channels":["email"],"body":"x"}') ->> 'ok',
  'false', 'a manual message to a suppressed address is not sent');

select throws_ok($$ select public.rpc_comms_workflow_save(jsonb_build_object('name', 'W 248',
    'trigger_kind', 'order.confirmed', 'condition', 'none', 'channels', array['email'],
    'template_id', (public.rpc_comms_template_save('{"name":"Promo 248","purpose":"marketing","channels":["email"],"email_body":"Deals","status":"active"}') ->> 'id'))) $$,
  '22023', null, 'a marketing template cannot run in a workflow without the consent condition');

select is(public.rpc_comms_setting_save('retry', '{"max_attempts": 40, "base_minutes": 1}') -> 'value' ->> 'max_attempts',
  '10', 'retry attempts are capped at 10');
select ok(public.rpc_comms_setting_save('retry', '{"max_attempts": 1, "base_minutes": 1}') ->> 'ok' = 'true',
  'retry rules save');

-- ─────────────────────────────────────────── the opt-out link

set local role anon;
select is(public.rpc_comms_unsubscribe((select v #>> '{}' from t248 where k = 'token')) ->> 'ok', 'true',
  'anyone holding the link can stop marketing');

reset role;
select is((select granted from public.comms_consent where email = 'host248@example.test' order by id desc limit 1),
  false, 'which records their no');

-- ─────────────────────────────────────────── the outbox follows the settings

select public.rpc_outbox_failed((select id from public.notification_outbox
  where recipient = 'host248@example.test' and template like 'comms.%' limit 1), 'mailbox full', true);
select is((select status from public.notification_outbox
  where recipient = 'host248@example.test' and template like 'comms.%' limit 1),
  'abandoned', 'with one attempt allowed, the first failure is final');

-- ─────────────────────────────────────────── tidy-ups (20270333000100)

select ok(not has_function_privilege('anon', 'public.fn_comms_render(text, jsonb)', 'execute'),
  'the text helpers are closed to anon');
select ok(exists (select 1 from pg_indexes where indexname = 'notification_outbox_email_sent_idx'),
  'sent email is indexed for the email limits');

select * from finish();
rollback;
