-- Which documents, how ready, and which columns a merchant may not set.

/*
 * Does this set of answers satisfy this condition?
 *
 * A condition is an object of answer keys to expected values. A single-choice
 * answer matches on equality; a multi-choice answer is an array and matches on
 * containment, so {"services":"express"} is true for a laundry that ticked
 * express among four other things.
 */
create or replace function public.fn_answer_matches(p_answers jsonb, p_condition jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(
    case jsonb_typeof(p_answers -> c.key)
      when 'array' then (p_answers -> c.key) @> to_jsonb(c.value #>> '{}')
      else (p_answers ->> c.key) is not distinct from (c.value #>> '{}')
    end
  ), true)
  from jsonb_each(coalesce(p_condition, '{}'::jsonb)) as c(key, value);
$$;

comment on function public.fn_answer_matches is
  'Whether merchant.answers satisfies an applies_when or extra_doc_rules condition. Multi-select answers match by containment.';

/*
 * The documents this particular business owes us.
 *
 * Two sources, because the question "which licence?" is asked from two
 * directions. A requirement can name the categories it applies to — a
 * pharmacy needs a PPB licence, full stop. And a category can name extra
 * requirements its answers trigger — a restaurant is not a bar, but a
 * restaurant that serves alcohol needs the same liquor licence a bar does.
 *
 * "Something else" borrows the rules of whichever category it said it was
 * closest to. That is a guess, which is why requires_ops_mapping is set and a
 * person confirms it before the merchant goes live.
 */
create or replace function public.fn_merchant_required_docs(p_merchant_id uuid)
returns setof public.document_requirement
language sql
stable
set search_path = ''
as $$
  with subject as (
    select
      coalesce(
        nullif(m.category::text, 'other'),
        m.answers ->> 'nearest_category',
        m.category::text
      )::public.merchant_category as cat,
      m.answers as answers
    from public.merchant m
    where m.id = p_merchant_id
  ),
  triggered as (
    select r.value ->> 'doc' as kind
    from subject s
    join public.category_config cc on cc.category = s.cat
    cross join lateral jsonb_array_elements(cc.extra_doc_rules) as r(value)
    where public.fn_answer_matches(s.answers, r.value -> 'when')
  )
  select dr.*
  from public.document_requirement dr
  cross join subject s
  where dr.owner_type = 'merchant'
    and dr.required
    and (
      dr.applies_when = '{}'::jsonb
      or (
        (not dr.applies_when ? 'category'
         or dr.applies_when -> 'category' @> to_jsonb(s.cat::text))
        and (not dr.applies_when ? 'answer'
         or public.fn_answer_matches(s.answers, dr.applies_when -> 'answer'))
      )
      or exists (select 1 from triggered t where t.kind = dr.kind)
    )
  order by dr.sort;
$$;

comment on function public.fn_merchant_required_docs is
  'Every document this business must provide, from the requirement''s own category rule and from the extra rules its answers triggered.';

-- ------------------------------------------------------------- readiness

/*
 * The six checks behind the ring on the right of every step.
 *
 * It is computed here rather than in the browser so that the number the
 * merchant watched climb is the same number the merchant team sees in the
 * console. A ring that says 83% to one of them and 67% to the other is worse
 * than no ring.
 */
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
  v_done integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;

  /*
   * Security definer, so it has to police itself. The readiness of a business
   * says whether they have uploaded their ID and set up a payout account —
   * their business and the merchant team's, nobody else's.
   *
   * A null uid means there is no browser session behind this call. Execute is
   * granted only to authenticated and service_role, so that is the service
   * role or a migration, both of which are already inside the fence.
   */
  if (select auth.uid()) is not null
     and not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  -- Business basics: a category, and an answer to each of its questions.
  if m.category is not null then
    select cc.questions into v_questions
    from public.category_config cc where cc.category = m.category;

    select coalesce(bool_and(
      m.answers ? (q.value ->> 'key')
      and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);
  end if;

  -- Location: a primary branch whose pin landed inside a zone we deliver from.
  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id and b.is_primary and b.zone_id is not null
  ) into v_location;

  v_hours := m.hours_pattern is not null and m.prep_minutes is not null;

  -- Documents: every essential requirement has something on file. Whether it
  -- is any good is the reviewer's call, not this function's.
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
    /* Floored, so the ring never claims a check that is not ticked: five of
       six reads 83, not 84. */
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;

grant execute on function public.fn_answer_matches(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.fn_merchant_readiness(uuid) to authenticated, service_role;
