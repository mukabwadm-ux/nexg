begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (
    select count(*)::integer
    from public.category_config
    where jsonb_array_length(subcategories) > 0
  ),
  (
    select count(*)::integer
    from public.category_config category
    where jsonb_array_length(category.subcategories) > 0
      and exists (
        select 1
        from jsonb_array_elements(category.questions) question(value)
        where question.value ->> 'key' = 'business_types'
          and question.value ->> 'type' = 'multi'
      )
  ),
  'every category with specialties has a multi-select business_types question'
);

select is(
  (
    select count(*)::integer
    from public.category_config category
    where jsonb_array_length(category.subcategories) > 0
      and exists (
        select 1
        from jsonb_array_elements(category.questions) question(value)
        where question.value ->> 'key' = 'business_types'
          and coalesce((question.value ->> 'step')::integer, 2) = 2
      )
  ),
  (
    select count(*)::integer
    from public.category_config
    where jsonb_array_length(subcategories) > 0
  ),
  'every specialty selector is shown in onboarding step 2'
);

select is(
  (
    select count(*)::integer
    from public.category_config category
    cross join lateral jsonb_array_elements(category.questions) question(value)
    where category.subcategories is not null
      and question.value ->> 'key' = 'business_types'
      and jsonb_array_length(question.value -> 'options') = jsonb_array_length(category.subcategories)
  ),
  (
    select count(*)::integer
    from public.category_config
    where jsonb_array_length(subcategories) > 0
  ),
  'every business_types question has one option per specialty'
);

select is(
  (
    select count(*)::integer
    from public.category_config category
    cross join lateral jsonb_array_elements(category.questions) question(value)
    cross join lateral jsonb_array_elements(question.value -> 'options') option(value)
    where question.value ->> 'key' = 'business_types'
      and not exists (
        select 1
        from jsonb_array_elements(category.subcategories) specialty(value)
        where specialty.value ->> 'id' = option.value ->> 'value'
      )
  ),
  0,
  'every business_types option value matches a category specialty id'
);

select * from finish();
rollback;
