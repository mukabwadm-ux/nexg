begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (
    select count(*)::integer
    from public.category_config c
    where c.category not in ('adults_only', 'alcohol_beverages')
      and (
        exists (
          select 1
          from jsonb_array_elements(c.questions) question(value)
          where question.value ->> 'key' = 'age_gate_method'
        )
        or exists (
          select 1
          from jsonb_array_elements(c.subcategories) subcategory(value)
          where exists (
            select 1
            from jsonb_array_elements_text(
              coalesce(subcategory.value -> 'fields', '[]'::jsonb)
            ) field(value)
            where field.value = 'age_gate_method'
          )
          or exists (
            select 1
            from jsonb_array_elements(
              coalesce(subcategory.value -> 'questions', '[]'::jsonb)
            ) question(value)
            where question.value ->> 'key' = 'age_gate_method'
          )
        )
      )
  ),
  0,
  'age-gate method is absent from categories without age restrictions'
);

/* Every specialty in the two age-restricted categories asks it, whatever base
   profile the master list (16 Nov 2026) built it from (20270102120100). */
select is(
  (
    select count(*)::integer
    from public.category_config c
    cross join lateral jsonb_array_elements(c.subcategories) subcategory(value)
    where c.category = 'adults_only'
      and not coalesce(subcategory.value -> 'fields', '[]'::jsonb) ? 'age_gate_method'
  ),
  0,
  'every adult specialty asks how the merchant checks age'
);

select is(
  (
    select count(*)::integer
    from public.category_config c
    cross join lateral jsonb_array_elements(c.subcategories) subcategory(value)
    where c.category = 'alcohol_beverages'
      and not coalesce(subcategory.value -> 'fields', '[]'::jsonb) ? 'age_gate_method'
  ),
  0,
  'every alcohol specialty asks how the merchant checks age'
);

/* An application's answers are checked against the registry, so an adult
   specialty asked the question must also be allowed to answer it. */
select is(
  (
    select count(*)::integer
    from public.merchant_application_registry r
    cross join lateral jsonb_array_elements_text(r.taxonomy -> 'adults_only') specialty(id)
    where r.revision = 'nexg-booking-2026-11-16.1'
      and jsonb_typeof(r.profile_questions -> specialty.id) = 'array'
      and not (r.profile_questions -> specialty.id) ? 'age_gate_method'
  ),
  0,
  'every adult specialty may answer the age-check question in an application'
);

select * from finish();
rollback;
