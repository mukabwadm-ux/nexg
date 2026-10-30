begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '88888888-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'category.owner@example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '88888888-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'category.ops@example', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values (
  '88888888-0000-0000-0000-000000000012',
  '88888888-0000-0000-0000-000000000002',
  'category.ops@example',
  'Category operations'
);

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  '88888888-0000-0000-0000-000000000012',
  (select id from public.role where key = 'merchant_ops'),
  null,
  '88888888-0000-0000-0000-000000000012';

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email
)
values (
  '88888888-0000-0000-0000-000000000021',
  'Dynamic Shop Limited',
  'Dynamic Shop',
  null,
  'Owner',
  '+254700000821',
  'category.owner@example'
), (
  '88888888-0000-0000-0000-000000000022',
  'Second Dynamic Shop Limited',
  'Second Dynamic Shop',
  null,
  'Owner',
  '+254700000822',
  'category.second@example'
);

insert into public.merchant_user (merchant_id, user_id, role)
values
  ('88888888-0000-0000-0000-000000000021', '88888888-0000-0000-0000-000000000001', 'owner'),
  ('88888888-0000-0000-0000-000000000022', '88888888-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_category_config_save(
    'managed_test',
    '{
      "label":"Managed Test",
      "description":"A category created by staff without a code deployment.",
      "icon":"Store",
      "card_kind":"products",
      "eta_style":"minutes",
      "sort":999,
      "is_active":true,
      "questions":[
        {"key":"business_model","label":"How do you sell?","type":"single","options":[{"value":"retail","label":"Retail"}]}
      ],
      "subcategories":[
        {"id":"specialty","name":"Specialty","fields":[],"questions":[
          {"key":"specialty_detail","label":"What do you offer?","type":"text"}
        ]}
      ],
      "extra_doc_rules":[],
      "catalogue_example":{"name":"Sample product","description":"Category-specific sample.","pricePlaceholder":"KES 1,000","photoHint":"Show the product clearly."}
    }'::jsonb
  )$$,
  'merchant operations can create a configurable category'
);

select is(
  (select category from public.category_config where category = 'managed_test'),
  'managed_test',
  'category IDs are stored as text rather than restricted to the merchant enum'
);

select ok(
  not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'merchant_category'
      and e.enumlabel = 'managed_test'
  ),
  'creating a category does not require adding a merchant enum value'
);

set local request.jwt.claims = '{"sub":"88888888-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_category_config_save(
    'not_allowed',
    '{"label":"Not allowed","icon":"Store","card_kind":"products","eta_style":"minutes"}'::jsonb
  )$$,
  '42501',
  'Merchant Ops or Super Admin access is required to manage categories.',
  'merchant users cannot manage the category catalogue'
);

select lives_ok(
  $$select public.rpc_merchant_set_category(
    '88888888-0000-0000-0000-000000000021',
    'managed_test',
    '{}'::jsonb
  )$$,
  'a merchant can select a configured dynamic category'
);

select is(
  (select category_key from public.merchant where id = '88888888-0000-0000-0000-000000000021'),
  'managed_test',
  'the dynamic category key is saved separately from the legacy enum'
);

select is(
  (select category::text from public.merchant where id = '88888888-0000-0000-0000-000000000021'),
  'other',
  'the legacy category column remains compatible with existing integrations'
);

select is(
  public.fn_merchant_readiness('88888888-0000-0000-0000-000000000021') ->> 'business_basics',
  'false',
  'readiness requires the configured category question and specialty answer'
);

select lives_ok(
  $$select public.rpc_merchant_set_subcategory(
    '88888888-0000-0000-0000-000000000021',
    'specialty'
  )$$,
  'a merchant can select a configured dynamic subcategory'
);

select is(
  public.fn_merchant_readiness('88888888-0000-0000-0000-000000000021') ->> 'business_basics',
  'false',
  'a configured specialty question blocks readiness until answered'
);

select lives_ok(
  $$select public.rpc_merchant_set_category(
    '88888888-0000-0000-0000-000000000021',
    'managed_test',
    '{"business_model":"retail","specialty_detail":"Home goods"}'::jsonb
  )$$,
  'configured category answers can be saved on an application'
);

select is(
  public.fn_merchant_readiness('88888888-0000-0000-0000-000000000021') ->> 'business_basics',
  'true',
  'the dynamic category is ready once its configured questions are answered'
);

set local request.jwt.claims = '{"sub":"88888888-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_category_config_save(
    'managed_test',
    '{
      "label":"Managed Test",
      "icon":"Store",
      "card_kind":"products",
      "eta_style":"minutes",
      "sort":999,
      "is_active":false,
      "questions":[
        {"key":"business_model","label":"How do you sell?","type":"single","options":[{"value":"retail","label":"Retail"}]}
      ],
      "subcategories":[
        {"id":"specialty","name":"Specialty","fields":[],"questions":[
          {"key":"specialty_detail","label":"What do you offer?","type":"text"}
        ]}
      ],
      "extra_doc_rules":[],
      "catalogue_example":{"name":"Sample product","description":"Category-specific sample.","pricePlaceholder":"KES 1,000","photoHint":"Show the product clearly."}
    }'::jsonb
  )$$,
  'staff can archive rather than delete a category'
);

set local request.jwt.claims = '{"sub":"88888888-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_set_category(
    '88888888-0000-0000-0000-000000000021',
    'managed_test',
    '{"business_model":"retail","specialty_detail":"Home goods"}'::jsonb
  )$$,
  'an in-progress application can keep its archived category'
);

select throws_ok(
  $$select public.rpc_merchant_set_category(
    '88888888-0000-0000-0000-000000000022',
    'managed_test',
    '{}'::jsonb
  )$$,
  'P0002',
  'We do not have that kind of business on the list.',
  'new applications cannot select an archived category'
);

select throws_ok(
  $$select public.rpc_merchant_set_category(
    '88888888-0000-0000-0000-000000000021',
    'not_allowed',
    '{}'::jsonb
  )$$,
  'P0002',
  'We do not have that kind of business on the list.',
  'a merchant cannot select an unconfigured category'
);

select * from finish();
rollback;
