-- Email designs: who can see and upload them, what a design must contain,
-- one live design per kind of email, and what the senders get back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('12200000-0000-4000-8000-0000000000a1'::uuid, 'owner122@test.local'),
  ('12200000-0000-4000-8000-0000000000a2'::uuid, 'growth122@test.local'),
  ('12200000-0000-4000-8000-0000000000a3'::uuid, 'merchants122@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('12200000-0000-4000-8000-0000000000b1', '12200000-0000-4000-8000-0000000000a1', 'owner122@test.local', 'Owner 122'),
  ('12200000-0000-4000-8000-0000000000b2', '12200000-0000-4000-8000-0000000000a2', 'growth122@test.local', 'Growth 122'),
  ('12200000-0000-4000-8000-0000000000b3', '12200000-0000-4000-8000-0000000000a3', 'merchants122@test.local', 'Merchants 122');

/* A super_admin grant needs a second person to approve it
   (tg_role_grant_requires_second_approver): Merchants 122 does. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', g.approver
from (values
  ('12200000-0000-4000-8000-0000000000b1'::uuid, 'super_admin', '12200000-0000-4000-8000-0000000000b3'::uuid),
  ('12200000-0000-4000-8000-0000000000b2'::uuid, 'growth', null::uuid),
  ('12200000-0000-4000-8000-0000000000b3'::uuid, 'merchant_ops', null::uuid)
) as g (staff_id, role_key, approver)
join public.role r on r.key = g.role_key;

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

-- ------------------------------------------------------------------ wiring

select ok(
  (select relrowsecurity from pg_class where oid = 'public.email_design'::regclass),
  'Email designs have row-level security');

select is(
  (select public from storage.buckets where id = 'email-assets'),
  true,
  'Design images live in a public bucket, so inboxes can fetch them');

select is(
  (select count(*)::integer from audit.action_registry where action like 'settings.email\_design\_%'),
  4,
  'Uploading, making live, taking off and removing are registered actions');

select is(
  (select count(*)::integer from public.fn_wiring_check() where finding ~ 'email_design'),
  0,
  'The wiring check finds nothing to fix');

-- --------------------------------------------------------------- no access

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"12200000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.rpc_email_designs()$$,
  '42501', 'Not allowed.',
  'Staff whose roles do not reach Settings cannot list designs');

select throws_ok(
  $$select count(*) from public.email_design$$,
  '42501', null,
  'and nobody reads the table directly');

-- ------------------------------------------------------- limited Settings

select set_config('request.jwt.claims',
  '{"sub":"12200000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select lives_ok(
  $$select * from public.rpc_email_designs()$$,
  'Growth reaches Settings and can see the designs');

select is(
  (public.rpc_email_overview() ->> 'can_edit')::boolean,
  false,
  'but the tab tells it it cannot change them');

select throws_ok(
  $$select public.rpc_email_design_upload('merchant.live', 'Sneaky', '<html><body>{{content}} with enough words</body></html>')$$,
  '42501', 'Only a super admin or someone with full Settings access can upload email designs.',
  'and the database refuses an upload from it');

-- --------------------------------------------------------- the super admin

select set_config('request.jwt.claims',
  '{"sub":"12200000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (public.rpc_email_overview() ->> 'can_edit')::boolean,
  true,
  'A super admin can change designs');

select ok(
  public.rpc_email_overview() ?& array['sent_24h', 'failed_24h', 'waiting', 'skipped_24h', 'by_template'],
  'The overview counts sent, failed, waiting and skipped email, and per template');

select throws_ok(
  $$select public.rpc_email_design_upload('merchant.live', 'No message', '<html><body>A design with nowhere for the words</body></html>')$$,
  '22023', 'Put {{content}} where the message goes. Without it the email would arrive empty.',
  'A design must say where the message goes');

select throws_ok(
  $$select public.rpc_email_design_upload('merchant.live', 'Scripted', '<html><body>{{content}}<script>alert(1)</script></body></html>')$$,
  '22023', 'Emails cannot run scripts. Remove the <script> tags.',
  'and cannot carry a script');

select throws_ok(
  $$select public.rpc_email_design_upload('auth.code', 'Code', '<html><body>{{content}} and no code from Supabase</body></html>')$$,
  '22023', null,
  'A design for a Supabase email must keep the fields Supabase fills in');

select throws_ok(
  $$select public.rpc_email_design_upload('Not a purpose!', 'Bad', '<html><body>{{content}} with enough words</body></html>')$$,
  '22023', 'Choose what the design is for.',
  'and every design is for a known kind of email');

select lives_ok(
  $$insert into t values ('first', public.rpc_email_design_upload(
      'merchant.live', 'Spring look', '<html><body><h1>{{title}}</h1>{{content}}{{action}}</body></html>',
      'spring.html', 'For the launch', '{"logo.png":"https://example.test/logo.png"}'::jsonb))$$,
  'A super admin uploads a design');

select is(
  (select status || '/' || image_count || '/' || uploaded_by from public.rpc_email_designs()
    where id = (select v::uuid from t where k = 'first')),
  'draft/1/Owner 122',
  'It waits as a draft, with its image and who uploaded it');

select is(
  public.rpc_email_design_public('merchant.live'),
  null,
  'and senders keep the house design until it is made live');

select is(
  public.rpc_email_design_set_status((select v::uuid from t where k = 'first'), 'live') ->> 'status',
  'live',
  'Making it live');

select is(
  public.rpc_email_design_public('merchant.live'),
  '<html><body><h1>{{title}}</h1>{{content}}{{action}}</body></html>',
  'gives senders the design');

select lives_ok(
  $$insert into t values ('second', public.rpc_email_design_upload(
      'merchant.live', 'Winter look', '<html><body><h2>{{title}}</h2>{{content}}</body></html>',
      null, null, '{}'::jsonb, true))$$,
  'Uploading another design and making it live straight away');

select is(
  (select string_agg(name || '=' || status, ',' order by name) from public.rpc_email_designs()
    where purpose = 'merchant.live'),
  'Spring look=draft,Winter look=live',
  'takes the one before it off: one live design per kind of email');

select is(
  public.rpc_email_design_set_status((select v::uuid from t where k = 'second'), 'draft') ->> 'status',
  'draft',
  'Taking the live design off');

select is(
  public.rpc_email_design_public('merchant.live'),
  null,
  'sends that kind of email in the house design again');

select is(
  public.rpc_email_design_set_status((select v::uuid from t where k = 'first'), 'archived') ->> 'status',
  'archived',
  'Removing a design');

select is(
  (select count(*)::integer from public.rpc_email_designs() where id = (select v::uuid from t where k = 'first')),
  0,
  'takes it off the list');

select throws_ok(
  format('select public.rpc_email_design_set_status(%L, %L)', (select v from t where k = 'first'), 'live'),
  '22023', 'That design was removed. Upload the file again to use it.',
  'and it cannot come back');

-- --------------------------------------------------------- the senders

select set_config('request.jwt.claims', '', true);
set local role anon;

select lives_ok(
  $$select public.rpc_email_design_public('merchant.live')$$,
  'The website''s own key can ask for a live design');

select throws_ok(
  $$select public.rpc_email_design_upload('merchant.live', 'Anon', '<html><body>{{content}} with enough words</body></html>')$$,
  '42501', null,
  'but cannot upload one');

reset role;

select is(
  (select count(distinct action)::integer from audit.audit_event
    where action like 'settings.email\_design\_%'
      and target_id in (select v::uuid from t)),
  4,
  'Every change is in the audit log');

select * from finish();
rollback;
