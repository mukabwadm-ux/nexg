-- Readiness and Home see the hours and payout the setup screens save.
--
-- fn_merchant_readiness (20261105000000) reads the hours and payout the
-- first onboarding wrote: merchant.hours_pattern and merchant.payout_rail /
-- payout_account. The current screens save opening hours as merchant_hours
-- rows (rpc_merchant_setup_hours_save, rpc_hours_set) and the payout an
-- applicant declares as merchant_application_payout. So a merchant who had
-- saved both still saw hours and payout as missing, and Home's "Needs
-- attention" kept saying "Payout method not set". On 18 Nov 2026 production
-- had 15 merchants with saved hours and 2 with a declared payout that
-- readiness could not see.
--
-- 1. Hours count when either the old pattern or an open merchant_hours row
--    exists. Payout counts when either the old fields or a declared payout
--    exists. Business basics count once an application has been submitted:
--    the new form keeps its answers on merchant_application, not in
--    merchant.answers, and validates them on submit. Nothing else in the
--    function changes. Going live does not use readiness, so this only
--    changes what the checklist, Home and the admin record show.
-- 2. fn_merchant_payout_declared tells merchant_attention_v whether a payout
--    was declared. The view runs as the caller, who cannot read
--    merchant_application_payout, so it asks a definer function that answers
--    true or false and only for the caller's own business or staff.
-- 3. The photo reminder said "1 items without photos"; it now counts.
--
-- Location is unchanged on purpose: it still needs a pin or a zone, because
-- riders are sent to the pin and an address alone cannot be routed to.
--
-- Rollback: re-run fn_merchant_readiness from
-- 20261105000000_laundry_multi_specialty_onboarding.sql and
-- merchant_attention_v from 20260101019000_what_the_merchant_dashboard_reads.sql,
-- then drop function public.fn_merchant_payout_declared(uuid);

create or replace function public.fn_merchant_payout_declared(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_application_payout ap
    join public.merchant m on m.id = ap.merchant_id
    where ap.merchant_id = p_merchant_id
      and ap.account <> '{}'::jsonb
      -- As fn_merchant_readiness: a server context with no user may ask.
      and ((select auth.uid()) is null
           or authz.is_merchant_member(m.id)
           or authz.can_manage_merchants(m.city_id))
  )
$$;

revoke all on function public.fn_merchant_payout_declared(uuid) from public, anon;
grant execute on function public.fn_merchant_payout_declared(uuid) to authenticated, service_role;

create or replace function public.fn_merchant_readiness(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
        cross join lateral jsonb_array_elements(category.subcategories || category.retired_subcategories) specialty(value)
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
      cross join lateral jsonb_array_elements(category.subcategories || category.retired_subcategories) s(value)
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

  -- An applicant's answers live on the application, not in merchant.answers,
  -- and the application is validated when it is submitted.
  if not v_basics and exists (
    select 1 from public.merchant_application a
    where a.merchant_id = m.id and a.submitted_revision is not null
  ) then
    v_basics := true;
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

  -- The first onboarding saved a pattern; the setup screens save rows.
  v_hours := (
      m.hours_pattern is not null
      or exists (
        select 1 from public.merchant_hours h
        where h.merchant_id = m.id
          and not h.closed
          and h.opens is not null
          and h.closes is not null
      )
    )
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

  -- The first onboarding saved the payout on the merchant; an applicant
  -- declares it on the application.
  v_payout := (
      m.payout_rail is not null
      and m.payout_account is not null
      and m.payout_account <> '{}'::jsonb
    )
    or exists (
      select 1 from public.merchant_application_payout ap
      where ap.merchant_id = m.id
        and ap.account <> '{}'::jsonb
    );

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
$function$;

create or replace view merchant_attention_v
with (security_invoker = true) as
-- documents that are missing, rejected or asked for
select
  m.id as merchant_id, 1 as sort, 'documents'::text as kind,
  'danger'::text as tone,
  (h.documents_missing + h.documents_to_fix + h.documents_asked_for)::text
    || ' document' ||
    case when (h.documents_missing + h.documents_to_fix + h.documents_asked_for) = 1
         then '' else 's' end || ' needed' as title,
  'Photos from your phone are fine; we review within one working day.'::text as body,
  'Upload now'::text as action,
  '/merchant/documents'::text as href
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where (h.documents_missing + h.documents_to_fix + h.documents_asked_for) > 0
union all
-- nowhere to send the money: neither saved on the merchant nor declared
select
  m.id, 2, 'payout', 'warn',
  'Payout method not set',
  'Weekly settlements pay out on Fridays. Add an M-Pesa till, paybill or bank account.',
  'Set up payouts', '/merchant/money'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.payout_rail is null
  and not public.fn_merchant_payout_declared(m.id)
union all
-- a document that will expire before anyone thinks about it
select
  m.id, 3, 'document_expiring', 'warn',
  h.documents_expiring::text || ' document' ||
    case when h.documents_expiring = 1 then '' else 's' end || ' expiring',
  'Re-upload to stay visible in Explore. An expired document hides you rather than warning you.',
  'Upload now', '/merchant/documents'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.documents_expiring > 0
union all
-- items a guest cannot picture
select
  m.id, 4, 'no_photos', 'info',
  p.n::text || case when p.n = 1 then ' item without a photo' else ' items without photos' end,
  'Optional before go-live, but items with photos get ordered far more often.',
  'Add photos', '/merchant/menu'
from public.merchant m
cross join lateral (
  select count(*) as n from public.catalogue_item it
  where it.merchant_id = m.id and it.photo_path is null
) p
where p.n > 0
union all
-- somebody is waiting on a reply
select
  m.id, 5, 'messages', 'good',
  'Message from merchant ops',
  'A thread is waiting on you.',
  'Reply', '/merchant/messages'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.unread_messages > 0;

grant select on merchant_attention_v to authenticated;
