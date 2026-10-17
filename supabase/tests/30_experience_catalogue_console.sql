begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_save_experience_catalogue(text,uuid,jsonb,jsonb)',
    'execute'
  ),
  'anonymous callers cannot edit the catalogue'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_save_experience_catalogue(text,uuid,jsonb,jsonb)',
    'execute'
  ),
  'signed-in staff can reach the catalogue RPC, which enforces the role'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current, phone_change,
  phone_change_token, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  'e2080000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'xp.catalogue.growth@example.test', '',
  now(), now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'e2080000-0000-4000-8000-000000000004',
  'authenticated', 'authenticated', 'xp.catalogue.visitor@example.test', '',
  now(), now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.staff_user (id, user_id, email, display_name)
values (
  'e2080000-0000-4000-8000-000000000002',
  'e2080000-0000-4000-8000-000000000001',
  'xp.catalogue.growth@example.test',
  'Catalogue growth'
);

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
values (
  'e2080000-0000-4000-8000-000000000002',
  (select id from public.role where key = 'growth'),
  null,
  'e2080000-0000-4000-8000-000000000002'
);

insert into public.curated_day (
  id, city_id, slug, title, price_per_person_kes, status
)
values (
  'e2080000-0000-4000-8000-000000000003',
  (select id from public.city where slug = 'nairobi'),
  'catalogue-empty-day',
  'Catalogue empty day',
  1000,
  'draft'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2080000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.rpc_save_experience_catalogue('event', null, '{}'::jsonb, '[]'::jsonb)$$,
  '42501',
  null,
  'a signed-in user without a catalogue role cannot edit'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2080000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.rpc_publish_curated_day('e2080000-0000-4000-8000-000000000003')$$,
  '23514',
  null,
  'a curated day with no blocks cannot be published'
);

reset role;
select is(
  (select status from public.curated_day
   where id = 'e2080000-0000-4000-8000-000000000003'),
  'draft',
  'a refused publication leaves the day a draft'
);

select * from finish();
rollback;
