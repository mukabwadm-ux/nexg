-- Merchants left on a subcategory the master list (16 Nov 2026) retired keep a
-- working setup: readiness reads the retired definition, the owner can re-save
-- it, and nobody can pick it anew (20270102120200).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'retired-owner@shop.example', '', now(), now(), now());

insert into public.merchant (id, legal_name, trading_name, category, category_key, subcategory, contact_name, contact_phone, contact_email, city_id, answers)
values (
  'dddddddd-0000-0000-0000-000000000100', 'Retired Spec Limited', 'Retired Spec', 'restaurants_food', 'restaurants_food', 'cloud_kitchen',
  'Ann Owner', '+254700000100', 'retired-owner@shop.example', (select id from public.city where slug = 'nairobi'), '{}'::jsonb
);
insert into public.merchant_user (merchant_id, user_id, role)
values ('dddddddd-0000-0000-0000-000000000100', '66666666-6666-6666-6666-666666666666', 'owner');

select ok(
  exists (
    select 1 from public.category_config cc, jsonb_array_elements(cc.retired_subcategories) s(value)
    where cc.category = 'restaurants_food' and s.value ->> 'id' = 'cloud_kitchen'
  ) and not exists (
    select 1 from public.category_config cc, jsonb_array_elements(cc.subcategories) s(value)
    where cc.category = 'restaurants_food' and s.value ->> 'id' = 'cloud_kitchen'
  ),
  'a retired specialty keeps its definition but is not offered'
);

select is(
  (public.fn_merchant_readiness('dddddddd-0000-0000-0000-000000000100') ->> 'business_basics')::boolean,
  false,
  'a merchant on a retired specialty with its questions unanswered is not ready'
);

-- Answer every category question and every question the retired definition asks.
update public.merchant m
set answers = (
  select jsonb_object_agg(question.value ->> 'key', to_jsonb('answered'::text))
  from public.category_config cc,
    jsonb_array_elements(
      cc.questions
      || coalesce((select s.value -> 'questions' from jsonb_array_elements(cc.retired_subcategories) s(value)
                   where s.value ->> 'id' = 'cloud_kitchen'), '[]'::jsonb)
    ) question(value)
  where cc.category = 'restaurants_food' and question.value ->> 'key' <> 'business_types'
) || '{"business_types":["cloud_kitchen"]}'::jsonb
where m.id = 'dddddddd-0000-0000-0000-000000000100';

select is(
  (public.fn_merchant_readiness('dddddddd-0000-0000-0000-000000000100') ->> 'business_basics')::boolean,
  true,
  'answering the retired specialty''s own questions completes business basics'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_set_subcategory('dddddddd-0000-0000-0000-000000000100', 'cloud_kitchen')$$,
  'an owner can re-save the retired specialty they already have'
);

select throws_ok(
  $$select public.rpc_merchant_set_subcategory('dddddddd-0000-0000-0000-000000000100', 'desserts')$$,
  '23514',
  'Choose a specialty shown for this business category.',
  'a retired specialty cannot be chosen anew'
);

select lives_ok(
  $$select public.rpc_merchant_set_subcategory('dddddddd-0000-0000-0000-000000000100', 'seafood_grill')$$,
  'an owner on a retired specialty can move to a current one'
);

reset role;

select * from finish();
rollback;
