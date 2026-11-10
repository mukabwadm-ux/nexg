-- Settings → API & Webhooks: webhook status for settings staff only, from real events.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0590000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fin@overview.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0590000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ops@overview.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0590000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'guest@overview.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c0590000-0000-4000-8000-000000000011', 'c0590000-0000-4000-8000-000000000001', 'fin@overview.test', 'Finance Overview'),
  ('c0590000-0000-4000-8000-000000000012', 'c0590000-0000-4000-8000-000000000002', 'ops@overview.test', 'Ops Overview');

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'c0590000-0000-4000-8000-000000000012', r.id,
       (select id from public.staff_user where id not in ('c0590000-0000-4000-8000-000000000011', 'c0590000-0000-4000-8000-000000000012') limit 1),
       'c0590000-0000-4000-8000-000000000011'
from public.role r where r.key = 'ops_manager';

delete from vault.secrets where name in ('paystack_secret_key', 'bank_webhook_secret');
select vault.create_secret('ci-only-overview-bank-secret-0123456789', 'bank_webhook_secret');

insert into public.payment_event (provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
values
  ('bank_sandbox', 'bank.collection.succeeded', 'bank:evt_overview_1', 'OVERVIEW-1', '{}', true, true, null),
  ('bank_sandbox', 'bank.collection.succeeded', 'bank:evt_overview_2', 'OVERVIEW-2', '{}', true, false, 'no payment with that reference');

-- Settings staff see the status.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0590000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(jsonb_array_length(public.rpc_api_overview() -> 'webhooks'), 3, 'three incoming webhooks are reported');
select is((select w ->> 'secret_set' from jsonb_array_elements(public.rpc_api_overview() -> 'webhooks') w where w ->> 'key' = 'bank'),
  'true', 'a webhook secret in Vault shows as set');
select is((select w ->> 'secret_set' from jsonb_array_elements(public.rpc_api_overview() -> 'webhooks') w where w ->> 'key' = 'paystack'),
  'false', 'a missing one shows as not set');
select ok((select (w ->> 'events_30d')::int >= 2 from jsonb_array_elements(public.rpc_api_overview() -> 'webhooks') w where w ->> 'key' = 'bank'),
  'bank events from the last 30 days are counted');
select ok((select (w ->> 'unhandled_30d')::int >= 1 from jsonb_array_elements(public.rpc_api_overview() -> 'webhooks') w where w ->> 'key' = 'bank'),
  'an event that was stored but not handled is counted separately');
select ok(public.rpc_api_overview() -> 'api_keys' ? 'active', 'API key counts are included');

-- Someone outside settings does not.
select set_config('request.jwt.claims', '{"sub":"c0590000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.rpc_api_overview()$$, '42501', null, 'a non-staff user cannot read it');
reset role;

select * from finish();
rollback;
