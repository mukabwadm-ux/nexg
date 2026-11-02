create or replace function pg_temp.age_gate_questions(p_questions jsonb, p_keep boolean)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(question.value order by question.ordinality), '[]'::jsonb)
  from jsonb_array_elements(p_questions) with ordinality as question(value, ordinality)
  where p_keep or question.value ->> 'key' <> 'age_gate_method'
$$;

create or replace function pg_temp.age_gate_fields(
  p_fields jsonb,
  p_keep boolean,
  p_add boolean
)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(to_jsonb(field.value) order by field.ordinality),
    '[]'::jsonb
  ) || case
    when p_add and not exists (
      select 1
      from jsonb_array_elements_text(p_fields) field(value)
      where field.value = 'age_gate_method'
    ) then '["age_gate_method"]'::jsonb
    else '[]'::jsonb
  end
  from jsonb_array_elements_text(p_fields) with ordinality as field(value, ordinality)
  where p_keep or field.value <> 'age_gate_method'
$$;

create or replace function pg_temp.age_gate_subcategory(
  p_subcategory jsonb,
  p_keep boolean,
  p_add boolean
)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    case
      when p_subcategory ? 'questions' then
        jsonb_set(
          p_subcategory,
          '{questions}',
          pg_temp.age_gate_questions(p_subcategory -> 'questions', p_keep),
          true
        )
      else p_subcategory
    end,
    '{fields}',
    pg_temp.age_gate_fields(
      coalesce(p_subcategory -> 'fields', '[]'::jsonb),
      p_keep,
      p_add
    ),
    true
  )
$$;

update public.category_config c
set
  questions = pg_temp.age_gate_questions(
    c.questions,
    c.category in ('adults_only', 'alcohol_beverages')
  ),
  subcategories = coalesce(
    (
      select jsonb_agg(
        pg_temp.age_gate_subcategory(
          subcategory.value,
          c.category in ('adults_only', 'alcohol_beverages'),
          c.category = 'alcohol_beverages'
        )
        order by subcategory.ordinality
      )
      from jsonb_array_elements(c.subcategories)
        with ordinality as subcategory(value, ordinality)
    ),
    '[]'::jsonb
  )
where c.subcategories::text like '%age_gate_method%'
   or c.questions @> '[{"key":"age_gate_method"}]'::jsonb
   or c.category = 'alcohol_beverages';
