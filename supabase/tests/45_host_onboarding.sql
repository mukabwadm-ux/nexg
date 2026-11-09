-- Host onboarding: the account, the documents, and the lock.
--
-- A host applies from /hosts with an anonymous session, which becomes their
-- login once they verify their email. They upload an ID and proof of
-- authority in the workspace, NexG reviews them, and only then is the host
-- activated. Until then they cannot add or change properties or units.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

-- ─────────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d4500000-0000-4000-8000-000000000001',
   'authenticated','authenticated',null,true,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4500000-0000-4000-8000-000000000002',
   'authenticated','authenticated',null,true,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d4500000-0000-4000-8000-0000000000aa',
   'authenticated','authenticated','ho.desk@nexgapp.com',false,now(),now());

insert into public.staff_user (id, user_id, email, display_name)
values ('d45000aa-0000-4000-8000-00000000000a','d4500000-0000-4000-8000-0000000000aa',
        'ho.desk@nexgapp.com','Host onboarding desk');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'ho.desk@nexgapp.com';

-- ══════════════════════════════════════════════ 1. apply makes an account

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);

select throws_ok(
  $$ select public.rpc_host_apply(jsonb_build_object(
       'contact_name','[Host]','phone','+254700045001','address','[Address]','handoff','lockbox')) $$,
  '22023', 'Enter the email address you will sign in with.',
  'An email is required: it is the login and where the welcome email goes.');

insert into t (k, v)
select 'apply', public.rpc_host_apply(jsonb_build_object(
  'contact_name','[Host]','display_name','[Host]','phone','+254700045001',
  'email','Host45@Example.test','address','[Address], Kilimani','handoff','lockbox',
  'units_band','1','kind','single_unit','city','nairobi'))::text;

insert into t (k, v) select 'host', (select v::jsonb ->> 'host_id' from t where k = 'apply');
insert into t (k, v) select 'unit', (select v::jsonb ->> 'unit_id' from t where k = 'apply');

reset role;

select is(
  (select role from public.host_user
    where host_id = (select v::uuid from t where k = 'host')
      and user_id = 'd4500000-0000-4000-8000-000000000001'),
  'owner',
  'The applicant owns the host they created, so they can sign in to it later.');

select is(
  (select email from public.host where id = (select v::uuid from t where k = 'host')),
  'host45@example.test',
  'The email is stored lower-cased, matching the auth email it will be verified as.');

select is(
  (select status::text from public.host where id = (select v::uuid from t where k = 'host')),
  'applied',
  'And the host starts as applied, not live.');

select isnt((select v from t where k = 'unit'), null, 'The first unit is created from the form.');

set local role authenticated;

select throws_ok(
  $$ select public.rpc_host_apply(jsonb_build_object(
       'contact_name','[Again]','phone','+254700045009','email','again@example.test',
       'address','[Address]','handoff','lockbox')) $$,
  '23505', null,
  'One account, one host: applying twice from the same session is refused.');

/* Another visitor reusing the phone used to overwrite the host's email. */
select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}', true);

select throws_ok(
  $$ select public.rpc_host_apply(jsonb_build_object(
       'contact_name','[Someone else]','phone','+254700045001','email','attacker@example.test',
       'address','[Address]','handoff','lockbox')) $$,
  '23505', null,
  'A registered phone number cannot be re-used to take over the host.');

reset role;

select is(
  (select email from public.host where phone = '+254700045001'),
  'host45@example.test',
  'And the original email is untouched.');

-- ══════════════════════════════════ 2. locked until NexG approves the host

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid, '{"name":"Renamed"}'::jsonb, %L::uuid) $$,
    (select v from t where k = 'host'), (select v from t where k = 'unit')),
  '42501', null,
  'Before approval a host cannot change units.');

select throws_ok(
  format($$ select public.rpc_property_upsert(%L::uuid, '{"name":"Block"}'::jsonb) $$,
    (select v from t where k = 'host')),
  '42501', null,
  'Or add a property.');

-- ═══════════════════════════════════════════════════════ 3. documents

select throws_ok(
  format($$ select public.rpc_host_documents_submit(%L::uuid) $$, (select v from t where k = 'host')),
  '22023', null,
  'Review cannot be requested without the required documents.');

select throws_ok(
  format($$ select public.rpc_host_document_add(%L::uuid, 'id_document', %L, 'id.pdf', 'application/pdf', 1000) $$,
    (select v from t where k = 'host'), 'host/' || (select v from t where k = 'host') || '/id_document/missing.pdf'),
  '22023', null,
  'A document is only recorded once its file is in storage.');

select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id) values
       ('partner-documents', %L, 'd4500000-0000-4000-8000-000000000001'),
       ('partner-documents', %L, 'd4500000-0000-4000-8000-000000000001') $$,
    'host/' || (select v from t where k = 'host') || '/id_document/id.pdf',
    'host/' || (select v from t where k = 'host') || '/authority/lease.pdf'),
  'The host can upload into its own folder of the private documents bucket.');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('partner-documents', 'host/' || gen_random_uuid() || '/id_document/x.pdf',
        'd4500000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'But not into another host''s folder.');

insert into t (k, v) select 'doc_id', public.rpc_host_document_add(
  (select v::uuid from t where k = 'host'), 'id_document',
  'host/' || (select v from t where k = 'host') || '/id_document/id.pdf', 'id.pdf', 'application/pdf', 1000)::text;
insert into t (k, v) select 'doc_auth', public.rpc_host_document_add(
  (select v::uuid from t where k = 'host'), 'authority',
  'host/' || (select v from t where k = 'host') || '/authority/lease.pdf', 'lease.pdf', 'application/pdf', 2000)::text;

select is(
  public.rpc_host_documents_submit((select v::uuid from t where k = 'host'))::text,
  'verifying',
  'With both required documents the host can request review.');

select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.host_document where host_id = (select v::uuid from t where k = 'host')),
  0,
  'Another signed-in user cannot see the host''s documents.');

-- ═══════════════════════════════════════════════════ 4. review, approve

select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

select throws_ok(
  format($$ select public.rpc_host_verify(%L::uuid, 'id_document', '{}'::jsonb) $$,
    (select v from t where k = 'host')),
  '23514', null,
  'Staff cannot activate a host whose documents are not approved.');

select lives_ok(
  format($$ select public.rpc_host_document_review(%L::uuid, false, 'The photo is blurred.') $$,
    (select v from t where k = 'doc_id')),
  'Staff can reject a document with a reason.');

reset role;

select is(
  (select status::text from public.host where id = (select v::uuid from t where k = 'host')),
  'applied',
  'Rejecting a required document sends the host back to fix and resubmit.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

do $approve$
begin
  perform public.rpc_host_document_review((select v::uuid from t where k = 'doc_id'), true);
  perform public.rpc_host_document_review((select v::uuid from t where k = 'doc_auth'), true);
end
$approve$;

select lives_ok(
  format($$ select public.rpc_host_verify(%L::uuid, 'id_document', '{}'::jsonb) $$,
    (select v from t where k = 'host')),
  'With both documents approved, staff activate the host.');

reset role;

select is(
  (select h.status::text || '/' || u.status::text from public.host h
     join public.unit u on u.host_id = h.id
    where h.id = (select v::uuid from t where k = 'host')),
  'live/live',
  'The host is live, and so is its ready first unit.');

-- ═══════════════════════════════════════════ 5. and then they can list

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  format($$ select public.rpc_unit_upsert_guarded(%L::uuid,
       '{"name":"Unit 2","address_line":"[Address], Kilimani","handoff":"lockbox"}'::jsonb) $$,
    (select v from t where k = 'host')),
  'After approval the host can add units.');

reset role;

select * from finish();
rollback;
