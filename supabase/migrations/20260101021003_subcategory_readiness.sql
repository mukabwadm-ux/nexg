-- Require specialty-specific answers on the server for categories whose
-- onboarding questions are generated from the selected taxonomy subcategory.
create or replace function public.fn_merchant_readiness(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_questions jsonb;
  v_basics boolean := false;
  v_location boolean := false;
  v_hours boolean := false;
  v_documents boolean := false;
  v_payout boolean := false;
  v_items boolean := false;
  v_subcategory_basics boolean;
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

  if m.category is not null then
    select cc.questions into v_questions
    from public.category_config cc where cc.category = m.category;

    select coalesce(bool_and(
      m.answers ? (q.value ->> 'key')
      and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);

    if m.category::text = any(array[
      'adults_only', 'airport_transfers', 'fashion_apparel', 'vehicle_rentals',
      'experiences', 'financial_services', 'marketplace', 'health',
      'tech_electronics', 'travel_tours', 'vehicle_services', 'wellness',
      'concierge_services'
    ]) then
      select coalesce(bool_and(
        m.answers ? field.value
        and (m.answers -> field.value) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      ), false)
      into v_subcategory_basics
      from public.category_config cc
      cross join lateral jsonb_array_elements(cc.subcategories) as subcategory(value)
      cross join lateral jsonb_array_elements_text(subcategory.value -> 'fields') as field(value)
      where cc.category = m.category
        and subcategory.value ->> 'id' = m.subcategory;

      v_basics := v_basics and v_subcategory_basics;
    end if;
  end if;

  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id and b.is_primary and b.zone_id is not null
  ) into v_location;

  v_hours := m.hours_pattern is not null and m.prep_minutes is not null;

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

grant execute on function public.fn_merchant_readiness(uuid) to authenticated, service_role;
