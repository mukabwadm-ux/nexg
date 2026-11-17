begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(
  exists (select 1 from public.category_config where category = 'restaurants_food'),
  'food and restaurant onboarding is configured'
);

select is(
  (select card_kind from public.category_config where category = 'restaurants_food'),
  'menu',
  'food merchants receive menu catalogue prompts'
);

select is(
  (
    select question.value ->> 'type'
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'restaurants_food'
      and question.value ->> 'key' = 'business_types'
  ),
  'multi',
  'merchants can select multiple food business types'
);

select is(
  (
    select jsonb_array_length(question.value -> 'options')
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'restaurants_food'
      and question.value ->> 'key' = 'business_types'
  ),
  10,
  'all ten food specialties on the master list (16 Nov 2026) are available'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    where cc.category = 'restaurants_food'
      and subcategory.value ? 'catalogueExample'
  ),
  10,
  'each food specialty has a catalogue example'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    where cc.category = 'restaurants_food'
      and coalesce(subcategory.value #>> '{catalogueExample,name}', '') = ''
  ),
  0,
  /* Specialties built on the same base profile share its example item (owner,
     17 Nov 2026: tailored examples per specialty can come later). */
  'every food specialty shows an example item name'
);

select is(
  (
    select question.value ->> 'step'
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'restaurants_food'
      and question.value ->> 'key' = 'allergen_information'
  ),
  '6',
  'menu information is collected in the final onboarding step'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalogue_item'
      and column_name = 'portion_size'
  ),
  'menu items store a portion or serving size'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalogue_item'
      and column_name = 'allergens'
  ),
  'menu items store allergen details'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalogue_item'
      and column_name = 'storage_guidance'
  ),
  'menu items store storage and reheating guidance'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalogue_item'
      and column_name = 'prep_time_minutes'
  ),
  'menu items can record an exceptional preparation time'
);

select ok(
  public.fn_category_condition_matches(
    '{"answer":"order_models","includes":"made_to_order"}'::jsonb,
    '{"order_models":["made_to_order","ready_to_sell"]}'::jsonb
  ),
  'preparation timing applies to made-to-order businesses'
);

select ok(
  not public.fn_category_condition_matches(
    '{"answer":"order_models","includes":"made_to_order"}'::jsonb,
    '{"order_models":["ready_to_sell"]}'::jsonb
  ),
  'preparation timing is not required for ready-to-sell businesses'
);

select ok(
  not public.fn_category_condition_matches(
    '{"answer":"fulfillment_methods","includes":"delivery"}'::jsonb,
    '{"fulfillment_methods":["customer_pickup"]}'::jsonb
  ),
  'rider packaging questions do not appear for pickup-only businesses'
);

select * from finish();
rollback;
