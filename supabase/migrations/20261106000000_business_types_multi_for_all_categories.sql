update public.category_config as category
set questions = category.questions || jsonb_build_array(
  jsonb_build_object(
    'key', 'business_types',
    'label', format('What kind of %s business do you run?', category.label),
    'type', 'multi',
    'step', 2,
    'hint', 'Select all that apply.',
    'options',
      (
        select jsonb_agg(
          jsonb_build_object(
            'value', specialty.value ->> 'id',
            'label', specialty.value ->> 'name'
          )
          order by specialty.ordinality
        )
        from jsonb_array_elements(category.subcategories) with ordinality as specialty(value, ordinality)
      )
  )
)
where jsonb_array_length(category.subcategories) > 0
  and not exists (
    select 1
    from jsonb_array_elements(category.questions) question(value)
    where question.value ->> 'key' = 'business_types'
  );
