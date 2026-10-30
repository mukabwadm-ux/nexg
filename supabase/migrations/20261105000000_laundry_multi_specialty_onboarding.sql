update public.category_config
set questions = questions || jsonb_build_array(
  jsonb_build_object(
    'key', 'business_types',
    'label', 'What kind of Laundry & Cleaning Business do you run?',
    'type', 'multi',
    'step', 2,
    'hint', 'Select all that apply.',
    'options', jsonb_build_array(
      jsonb_build_object('value', 'laundry', 'label', 'Laundry'),
      jsonb_build_object('value', 'dry_cleaning', 'label', 'Dry Cleaning'),
      jsonb_build_object('value', 'ironing', 'label', 'Ironing'),
      jsonb_build_object('value', 'home_cleaning', 'label', 'Home Cleaning'),
      jsonb_build_object('value', 'office_cleaning', 'label', 'Office Cleaning')
    )
  )
)
where category = 'laundry_cleaning'
  and not exists (
    select 1
    from jsonb_array_elements(questions) question(value)
    where question.value ->> 'key' = 'business_types'
  );

create or replace function public.fn_merchant_readiness(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_category_key text;
  v_questions jsonb;
  v_subcategory_basics boolean := false;
  v_prep_time_required boolean := false;
  v_basics boolean := false;
  v_location boolean := false;
  v_hours boolean := false;
  v_documents boolean := false;
  v_payout boolean := false;
  v_items boolean := false;
  v_done integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;

  if (select auth.uid()) is not null
     and not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  v_category_key := coalesce(m.category_key, m.category::text);
  if v_category_key is not null then
    select cc.questions, cc.prep_time_required
      into v_questions, v_prep_time_required
    from public.category_config cc
    where cc.category = v_category_key;

    select coalesce(bool_and(
      not coalesce((q.value ->> 'required')::boolean, true)
      or not public.fn_category_condition_matches(q.value -> 'when', m.answers)
      or (
        m.answers ? (q.value ->> 'key')
        and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      )
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);

    if jsonb_typeof(m.answers -> 'business_types') = 'array' then
      select coalesce(
        jsonb_array_length(m.answers -> 'business_types') > 0
        and count(subcategory.value) = jsonb_array_length(m.answers -> 'business_types')
        and bool_and(
          subcategory.value is not null
          and not exists (
            select 1
            from jsonb_array_elements_text(coalesce(subcategory.value -> 'fields', '[]'::jsonb)) field(key)
            where not (
              m.answers ? field.key
              and m.answers -> field.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
            )
          )
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(subcategory.value -> 'questions', '[]'::jsonb)) question(value)
            where coalesce((question.value ->> 'required')::boolean, true)
              and public.fn_category_condition_matches(question.value -> 'when', m.answers)
              and not (
                m.answers ? (question.value ->> 'key')
                and m.answers -> (question.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
              )
          )
        ),
        false
      )
      into v_subcategory_basics
      from jsonb_array_elements_text(m.answers -> 'business_types') as selected(id)
      left join lateral (
        select specialty.value
        from public.category_config category
        cross join lateral jsonb_array_elements(category.subcategories) specialty(value)
        where category.category = v_category_key
          and specialty.value ->> 'id' = selected.id
      ) as subcategory on true;
      v_basics := v_basics and v_subcategory_basics;
    elsif m.subcategory is not null then
      select coalesce(bool_and(
        not exists (
          select 1
          from jsonb_array_elements_text(coalesce(s.value -> 'fields', '[]'::jsonb)) field(key)
          where not (
            m.answers ? field.key
            and m.answers -> field.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
          )
        )
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(s.value -> 'questions', '[]'::jsonb)) question(value)
          where coalesce((question.value ->> 'required')::boolean, true)
            and public.fn_category_condition_matches(question.value -> 'when', m.answers)
            and not (
              m.answers ? (question.value ->> 'key')
              and m.answers -> (question.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
            )
        )
      ), false)
      into v_subcategory_basics
      from public.category_config category
      cross join lateral jsonb_array_elements(category.subcategories) s(value)
      where category.category = v_category_key
        and s.value ->> 'id' = m.subcategory;

      v_basics := v_basics and v_subcategory_basics;
    else
      select not exists (
        select 1
        from public.category_config category
        cross join lateral jsonb_array_elements(category.subcategories) specialty(value)
        where category.category = v_category_key
      ) into v_subcategory_basics;
      v_basics := v_basics and v_subcategory_basics;
    end if;

    if v_prep_time_required then
      select coalesce(
        public.fn_category_condition_matches(
          (select q.value -> 'prepTimeWhen'
           from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) q(value)
           where q.value ? 'prepTimeWhen'
           limit 1),
          m.answers
        ),
        true
      )
      into v_prep_time_required;
    end if;
  end if;

  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id
      and b.is_primary
      and (
        b.zone_id is not null
        or (
          b.location is not null
          and exists (select 1 from public.fn_serving_city(b.location))
        )
      )
  ) into v_location;

  v_hours := m.hours_pattern is not null
    and (not coalesce(v_prep_time_required, false) or m.prep_minutes is not null);

  select coalesce(bool_and(
    exists (
      select 1 from public.document d
      where d.owner_type = 'merchant' and d.owner_id = m.id
        and d.requirement_id = r.id
        and d.status in ('uploaded', 'verified')
    )
  ), false)
  into v_documents
  from public.fn_merchant_required_docs(m.id) r
  where r.essential;

  v_payout := m.payout_rail is not null
    and m.payout_account is not null
    and m.payout_account <> '{}'::jsonb;

  select count(*) >= 5 into v_items
  from public.catalogue_item ci
  where ci.merchant_id = m.id and length(trim(ci.name)) > 0;

  v_done := (v_basics)::int + (v_location)::int + (v_hours)::int
          + (v_documents)::int + (v_payout)::int + (v_items)::int;

  return jsonb_build_object(
    'business_basics', v_basics,
    'location', v_location,
    'hours_prep', v_hours,
    'documents', v_documents,
    'payout', v_payout,
    'first_items', v_items,
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;
