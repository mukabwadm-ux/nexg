begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

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

select is(
  (
    select count(*)::integer
    from public.category_config c
    cross join lateral jsonb_array_elements(c.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements_text(
      coalesce(subcategory.value -> 'fields', '[]'::jsonb)
    ) field(value)
    where c.category = 'adults_only'
      and field.value = 'age_gate_method'
  ),
  6,
  'adult specialties retain their age-gate method question'
);

select is(
  (
    select count(*)::integer
    from public.category_config c
    cross join lateral jsonb_array_elements(c.subcategories) subcategory(value)
    cross join lateral jsonb_array_elements_text(
      coalesce(subcategory.value -> 'fields', '[]'::jsonb)
    ) field(value)
    where c.category = 'alcohol_beverages'
      and field.value = 'age_gate_method'
  ),
  6,
  'alcohol specialties retain their age-gate method question'
);

select * from finish();
rollback;
