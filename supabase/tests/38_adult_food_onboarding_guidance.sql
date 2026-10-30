begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is(
  (
    select jsonb_array_length(questions)
    from public.category_config
    where category = 'adults_only'
  ),
  3,
  'adult onboarding asks about fulfillment, handover checks, and packaging'
);

select is(
  (
    select question.value ->> 'type'
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'adults_only'
      and question.value ->> 'key' = 'adult_fulfillment_methods'
  ),
  'multi',
  'adult merchants can select all supported fulfillment methods'
);

select ok(
  exists (
    select 1
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'adults_only'
      and question.value ->> 'key' = 'adult_handover_process'
      and question.value ->> 'hint' like '%confirm applicable checks%'
  ),
  'adult eligibility answers are recorded without assuming one universal rule'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements_text(subcategory.value -> 'fields') field(value)
    where cc.category = 'adults_only'
      and field.value = 'age_gate_method'
  ),
  6,
  'each adult specialty retains its age-check setup question'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category = 'restaurants_food'
  ),
  16,
  'each food specialty has two tailored setup questions'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    where cc.category = 'restaurants_food'
      and jsonb_array_length(subcategory.value -> 'questions') >= 2
  ),
  8,
  'all eight food specialties have tailored setup questions'
);

select ok(
  exists (
    select 1
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category = 'restaurants_food'
      and subcategory.value ->> 'id' = 'cloud_kitchen'
      and question.value ->> 'key' = 'cloud_kitchen_brand_relation'
  ),
  'cloud kitchens are asked whether their guest-facing brand differs from the kitchen'
);

select ok(
  exists (
    select 1
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category = 'restaurants_food'
      and subcategory.value ->> 'id' = 'catering'
      and question.value ->> 'key' = 'catering_service_inclusions'
  ),
  'caterers are asked what service and setup they provide'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category in ('adults_only', 'restaurants_food')
      and (
        question.value ->> 'key' is null
        or question.value ->> 'label' is null
        or question.value ->> 'type' is null
        or question.value ->> 'type' not in ('single', 'multi', 'text')
        or coalesce((question.value ->> 'step')::integer, 2) <> 2
        or jsonb_typeof(question.value -> 'options') is distinct from 'array'
      )
  ),
  0,
  'all tailored subcategory questions have valid keys, labels, types, and options'
);

select is(
  (
    select count(*)::integer
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.questions) question(value)
    where cc.category = 'adults_only'
      and (
        question.value ->> 'key' is null
        or question.value ->> 'label' is null
        or question.value ->> 'type' is null
        or question.value ->> 'type' not in ('single', 'multi', 'text')
        or coalesce((question.value ->> 'step')::integer, 2) <> 2
        or jsonb_typeof(question.value -> 'options') is distinct from 'array'
      )
  ),
  0,
  'all adult category questions have valid question shapes'
);

select ok(
  exists (
    select 1
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category = 'restaurants_food'
      and subcategory.value ->> 'id' = 'desserts'
      and question.value ->> 'key' = 'dessert_temperature_handling'
  ),
  'dessert merchants are asked about storage needs'
);

select ok(
  exists (
    select 1
    from public.category_config cc
    cross join lateral jsonb_array_elements(cc.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements(subcategory.value -> 'questions') question(value)
    where cc.category = 'restaurants_food'
      and subcategory.value ->> 'id' = 'cafe'
      and question.value ->> 'key' = 'cafe_drink_sizes'
  ),
  'cafes are asked which drink sizes they offer'
);

select * from finish();
rollback;
