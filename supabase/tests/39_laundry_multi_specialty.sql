begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (
    select question.value ->> 'type'
    from public.category_config category
    cross join lateral jsonb_array_elements(category.questions) question(value)
    where category.category = 'laundry_cleaning'
      and question.value ->> 'key' = 'business_types'
  ),
  'multi',
  'laundry merchants can select all applicable service types'
);

select is(
  (
    select jsonb_array_length(question.value -> 'options')
    from public.category_config category
    cross join lateral jsonb_array_elements(category.questions) question(value)
    where category.category = 'laundry_cleaning'
      and question.value ->> 'key' = 'business_types'
  ),
  5,
  'all five laundry and cleaning specialties are selectable'
);

select is(
  (
    select count(*)::integer
    from public.category_config category
    cross join lateral jsonb_array_elements(category.questions) question(value)
    cross join lateral jsonb_array_elements(question.value -> 'options') option(value)
    where category.category = 'laundry_cleaning'
      and question.value ->> 'key' = 'business_types'
      and not exists (
        select 1
        from jsonb_array_elements(category.subcategories) specialty(value)
        where specialty.value ->> 'id' = option.value ->> 'value'
      )
  ),
  0,
  'every laundry selection maps to a configured specialty'
);

with question_answers as (
  select
    question.value ->> 'key' as key,
    case
      when question.value ->> 'key' = 'business_types'
        then '["laundry","dry_cleaning"]'::jsonb
      else to_jsonb('answered'::text)
    end as value
  from public.category_config category
  cross join lateral jsonb_array_elements(category.questions) question(value)
  where category.category = 'laundry_cleaning'
), specialty_answers as (
  select field.value as key, to_jsonb('answered'::text) as value
  from public.category_config category
  cross join lateral jsonb_array_elements(category.subcategories) specialty(value)
  cross join lateral jsonb_array_elements_text(specialty.value -> 'fields') field(value)
  where category.category = 'laundry_cleaning'
    and specialty.value ->> 'id' in ('laundry', 'dry_cleaning')
), complete_answers as (
  select jsonb_object_agg(key, value) as value
  from (
    select * from question_answers
    union all
    select * from specialty_answers
  ) answers
)
insert into public.merchant (
  id, legal_name, trading_name, category, category_key,
  contact_name, contact_phone, contact_email, answers
)
select
  '99000000-0000-4000-8000-000000000039',
  'Laundry Test Limited',
  'Laundry Test',
  'laundry',
  'laundry_cleaning',
  'Owner',
  '+254700000039',
  'laundry-test@example.test',
  value
from complete_answers;

select is(
  (public.fn_merchant_readiness('99000000-0000-4000-8000-000000000039') ->> 'business_basics')::boolean,
  true,
  'readiness checks required setup for every selected laundry specialty'
);

with question_answers as (
  select
    question.value ->> 'key' as key,
    case
      when question.value ->> 'key' = 'business_types'
        then '["laundry","dry_cleaning"]'::jsonb
      else to_jsonb('answered'::text)
    end as value
  from public.category_config category
  cross join lateral jsonb_array_elements(category.questions) question(value)
  where category.category = 'laundry_cleaning'
), specialty_answers as (
  select field.value as key, to_jsonb('answered'::text) as value
  from public.category_config category
  cross join lateral jsonb_array_elements(category.subcategories) specialty(value)
  cross join lateral jsonb_array_elements_text(specialty.value -> 'fields') field(value)
  where category.category = 'laundry_cleaning'
    and specialty.value ->> 'id' = 'laundry'
), incomplete_answers as (
  select jsonb_object_agg(key, value) as value
  from (
    select * from question_answers
    union all
    select * from specialty_answers
  ) answers
)
insert into public.merchant (
  id, legal_name, trading_name, category, category_key,
  contact_name, contact_phone, contact_email, answers
)
select
  '99000000-0000-4000-8000-000000000040',
  'Incomplete Laundry Test Limited',
  'Incomplete Laundry Test',
  'laundry',
  'laundry_cleaning',
  'Owner',
  '+254700000040',
  'laundry-incomplete@example.test',
  value
from incomplete_answers;

select is(
  (public.fn_merchant_readiness('99000000-0000-4000-8000-000000000040') ->> 'business_basics')::boolean,
  false,
  'readiness stays incomplete when any selected specialty has unanswered setup'
);

select * from finish();
rollback;
