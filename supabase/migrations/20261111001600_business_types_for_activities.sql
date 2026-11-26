-- Activities, games & sports gets the "What kind of ... business" question.
--
-- 20261106000000 added a multi-select business_types question (one option per
-- specialty, onboarding step 2) to every category that existed then.
-- activities_games_sports arrived later (20261111000100) with 13 specialties
-- but no such question, so its merchants could not pick their specialties
-- (tests/40 caught it). This reruns the same idempotent update; categories
-- that already have the question are untouched.

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
