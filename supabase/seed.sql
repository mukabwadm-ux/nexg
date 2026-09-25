-- Local development fixtures.
--
-- Runs only on `supabase db reset`, never in production. Reference data that
-- production also needs — cities, roles, document requirements, setting keys —
-- lives in migrations instead, so it ships with the schema.
--
-- Everything here is obviously fake. Names are bracketed the way the artboards
-- bracket them, so a screenshot can never be mistaken for real partner data,
-- and no figure here is presented as a business number (ground rule 3).

-- A staff account for poking at the console locally. The auth user is created
-- with a known id so it can be signed in via the local Auth API.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'dev.admin@nexgapp.com',
  crypt('devpassword', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"[Dev Admin]"}'::jsonb
)
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name)
values (
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-000000000001',
  'dev.admin@nexgapp.com',
  '[Dev Admin]'
)
on conflict (id) do nothing;

-- Super admin across every city. Self-granted, which the second-approver rule
-- forbids — so it is approved by the same bootstrap account only because there
-- is nobody else yet. In production the first grant is made by hand.
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select
  '00000000-0000-4000-8000-00000000000a',
  r.id,
  null,
  '00000000-0000-4000-8000-00000000000a',
  null
from public.role r
where r.key = 'ops_manager'
on conflict do nothing;

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select '00000000-0000-4000-8000-00000000000a', r.id, null, '00000000-0000-4000-8000-00000000000a'
from public.role r
where r.key in ('rider_ops', 'merchant_ops', 'growth')
on conflict do nothing;

-- ------------------------------------------------------- a rider mid-pipeline

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle, plate_no)
values (
  '00000000-0000-4000-8000-00000000000b'::uuid,
  '[Rider', 'A]', '+254700000001',
  (select id from public.city where slug = 'nairobi'),
  'motorbike', 'KMC 123A'
)
on conflict (id) do nothing;

-- ---------------------------------------------------- a merchant mid-pipeline

insert into public.merchant (
  id, legal_name, trading_name, category,
  contact_name, contact_phone, contact_email, city_id
)
values (
  '00000000-0000-4000-8000-00000000000c'::uuid,
  '[Restaurant] Limited', '[Italian restaurant]', 'restaurant',
  '[Contact]', '+254700000002', 'merchant.a@example.com',
  (select id from public.city where slug = 'nairobi')
)
on conflict (id) do nothing;

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
select '00000000-0000-4000-8000-00000000000c'::uuid, 'Westlands', '[Address], Westlands', true
where not exists (
  select 1 from public.merchant_branch
  where merchant_id = '00000000-0000-4000-8000-00000000000c'::uuid and is_primary
);
