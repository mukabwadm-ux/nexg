begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current, phone_change,
  phone_change_token, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  'e2110000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'xp.builder.guest@example.test', '',
  now(), now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.plan (id, user_id, city_id, status, budget_kes, moods)
values
  (
    'e2110000-0000-4000-8000-000000000002',
    'e2110000-0000-4000-8000-000000000001',
    (select id from public.city where slug = 'nairobi'),
    'draft', 40000, '{}'
  ),
  (
    'e2110000-0000-4000-8000-000000000003',
    'e2110000-0000-4000-8000-000000000001',
    (select id from public.city where slug = 'nairobi'),
    'draft', 40000, array['wild']::public.mood[]
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e2110000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.rpc_send_plan(
    'e2110000-0000-4000-8000-000000000002',
    'Builder guest',
    '+254700000001'
  )$$,
  '23514',
  null,
  'an empty request without preferences cannot be sent'
);

select lives_ok(
  $$select public.rpc_send_plan(
    'e2110000-0000-4000-8000-000000000003',
    'Builder guest',
    '+254700000001'
  )$$,
  'a budgeted preference request can be sent when the catalogue has no match'
);

select is(
  (select status::text from public.plan
   where id = 'e2110000-0000-4000-8000-000000000003'),
  'sent',
  'the preference request enters the concierge queue'
);

select ok(
  (select flags @> '[{"kind":"catalogue_gap"}]'::jsonb from public.plan
   where id = 'e2110000-0000-4000-8000-000000000003'),
  'the concierge queue is told that catalogue sourcing is needed'
);

select * from finish();
rollback;
