/*
 * Merchants → Verification: the merchants waiting to go live, the figures
 * above them, and one merchant's file for the review pane.
 *
 * The queue is every merchant still in onboarding (applied, documents
 * pending or under review) that has not been deleted, deactivated or had
 * its application rejected. Each sits in exactly one tab:
 *
 *   resubmission  the merchant owes us something: the application came back
 *                 with changes requested, was edited after it was submitted,
 *                 or a current document is rejected or expired.
 *   under_review  every required document is in (the status function moves
 *                 a merchant to under_review only then), so the next step is
 *                 a person's decision.
 *   pending       still waiting for the merchant: documents missing, or the
 *                 application not submitted yet.
 *
 * "Submitted" is the application's submission time for merchants on the
 * application form, and the merchant's own submitted_at (else the day the
 * record was made) for those who applied before it.
 *
 * Figures:
 *   Pending verification  the whole queue.
 *   Under review          the under_review tab.
 *   Verified (this month) merchants that went live since the first of this
 *                         month in Nairobi.
 *   Rejected              applications whose current decision is rejected.
 *   Avg. verification     hours from submission to going live, averaged over
 *                         this month's verified merchants; null when none.
 *
 * Access: the Merchants module, and each merchant only for the people who
 * may work it (authz.works_merchant: super admin, or ops manager or
 * merchant ops in its city) — the same rule that sends an application back.
 *
 * The documents themselves, with their signed links, keep coming from
 * loadMerchantDocuments in the console, which reads them as before.
 *
 * Rollback:
 *   drop function if exists public.rpc_merchant_verification_detail(uuid);
 *   drop function if exists public.rpc_merchant_verification_list(text, text, text, integer, integer);
 *   drop function if exists public.rpc_merchant_verification_overview();
 *   drop function if exists public.fn_merchant_verification_rows();
 *   drop function if exists public.fn_merchant_category_label(text);
 */

-- A category key as people read it: the label in category_config, else the key itself tidied.
create or replace function public.fn_merchant_category_label(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select cc.label from public.category_config cc where cc.category::text = p_key),
    initcap(replace(coalesce(nullif(p_key, ''), 'other'), '_', ' '))
  )
$$;

-- The queue, one row per merchant the signed-in person may work.
create or replace function public.fn_merchant_verification_rows()
returns table (
  merchant_id uuid,
  name text,
  legal_name text,
  category_key text,
  category_label text,
  photo_path text,
  area text,
  phone text,
  email text,
  kra_pin text,
  status text,
  status_reason text,
  state text,
  managed boolean,
  review_state text,
  revision bigint,
  submitted_revision bigint,
  submitted_at timestamptz,
  created_at timestamptz,
  docs_rejected integer,
  docs_expired integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      m.id,
      m.trading_name,
      m.legal_name,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey,
      m.category_other,
      m.cover_photo_path,
      m.city_id,
      m.contact_phone,
      m.contact_email,
      m.kra_pin,
      m.status,
      m.status_reason,
      m.submitted_at,
      m.created_at,
      a.merchant_id is not null as is_managed,
      a.review_state as a_state,
      a.revision as a_revision,
      a.submitted_revision as a_submitted_revision,
      a.submitted_at as a_submitted_at
    from public.merchant m
    left join public.merchant_application a on a.merchant_id = m.id
    where m.status in ('applied', 'documents_pending', 'under_review')
      and m.deleted_at is null
      and m.deactivated_at is null
      and coalesce(a.review_state, '') <> 'rejected'
      and authz.works_merchant(m.id)
  )
  select
    b.id,
    coalesce(nullif(trim(b.trading_name), ''), b.legal_name),
    b.legal_name,
    b.ckey,
    case
      when b.ckey = 'other' and nullif(trim(b.category_other), '') is not null then trim(b.category_other)
      else public.fn_merchant_category_label(b.ckey)
    end,
    b.cover_photo_path,
    nullif(concat_ws(', ', z.name, c.name), ''),
    b.contact_phone,
    b.contact_email,
    b.kra_pin,
    b.status::text,
    b.status_reason,
    case
      when b.a_state = 'changes_requested'
        or (b.a_submitted_revision is not null and b.a_submitted_revision <> b.a_revision)
        or coalesce(d.rejected, 0) > 0 or coalesce(d.expired, 0) > 0
        then 'resubmission'
      when b.status = 'under_review' then 'under_review'
      else 'pending'
    end,
    b.is_managed,
    b.a_state,
    b.a_revision,
    b.a_submitted_revision,
    case when b.is_managed then b.a_submitted_at else coalesce(b.submitted_at, b.created_at) end,
    b.created_at,
    coalesce(d.rejected, 0)::integer,
    coalesce(d.expired, 0)::integer
  from base b
  left join public.city c on c.id = b.city_id
  left join lateral (
    select zo.name
    from public.merchant_branch br
    left join public.zone zo on zo.id = br.zone_id
    where br.merchant_id = b.id
      and br.deleted_at is null
    order by br.is_primary desc, br.sort nulls last, br.created_at
    limit 1
  ) z on true
  left join lateral (
    select
      count(*) filter (where doc.status = 'rejected') as rejected,
      count(*) filter (where doc.status = 'expired') as expired
    from public.document doc
    where doc.owner_type = 'merchant'
      and doc.owner_id = b.id
      and doc.superseded_at is null
  ) d on true
$$;

create or replace function public.rpc_merchant_verification_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month timestamptz :=
    date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;

  with q as (
    select * from public.fn_merchant_verification_rows()
  ),
  went as (
    select
      m.went_live_at,
      coalesce(a.submitted_at, m.submitted_at, m.created_at) as began
    from public.merchant m
    left join public.merchant_application a on a.merchant_id = m.id
    where m.went_live_at >= v_month
      and m.deleted_at is null
      and authz.works_merchant(m.id)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'queue', (select count(*) from q),
      'under_review', (select count(*) from q where q.state = 'under_review'),
      'verified_month', (select count(*) from went),
      'rejected', (
        select count(*)
        from public.merchant_application a
        join public.merchant m on m.id = a.merchant_id
        where a.review_state = 'rejected'
          and m.deleted_at is null
          and authz.works_merchant(m.id)
      ),
      'avg_hours', (
        select round((avg(extract(epoch from (w.went_live_at - w.began))) / 3600.0)::numeric, 1)
        from went w
        where w.went_live_at >= w.began
      )
    ),
    'tabs', jsonb_build_object(
      'all', (select count(*) from q),
      'under_review', (select count(*) from q where q.state = 'under_review'),
      'pending', (select count(*) from q where q.state = 'pending'),
      'resubmission', (select count(*) from q where q.state = 'resubmission')
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', c.k, 'label', c.l) order by c.l)
      from (select distinct q.category_key as k, q.category_label as l from q) c
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.rpc_merchant_verification_list(
  p_tab text default 'all',
  p_q text default null,
  p_category text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tab text := coalesce(nullif(p_tab, ''), 'all');
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_like text;
  v_digits text;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;
  if v_tab not in ('all', 'under_review', 'pending', 'resubmission') then
    raise exception 'Choose all, under review, pending or resubmission.' using errcode = '22023';
  end if;

  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_q, '\D', '', 'g');
    -- A phone number matches on its last nine digits, so 0712…, 712… and +254712… agree.
    v_digits := case when length(v_digits) >= 6 then right(v_digits, 9) end;
  end if;

  with q as (
    select r.*,
           'MER-' || upper(right(replace(r.merchant_id::text, '-', ''), 6)) as reference
    from public.fn_merchant_verification_rows() r
    where (v_tab = 'all' or r.state = v_tab)
      and (nullif(p_category, '') is null or r.category_key = p_category)
      and (
        v_like is null
        or r.name ilike v_like
        or r.legal_name ilike v_like
        or coalesce(r.email, '') ilike v_like
        or coalesce(r.kra_pin, '') ilike v_like
        or r.merchant_id::text ilike v_like
        or ('MER-' || upper(right(replace(r.merchant_id::text, '-', ''), 6))) ilike v_like
        or (v_digits is not null
            and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from q),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.submitted_at desc nulls last, p.name)
      from (
        select *
        from q
        order by q.submitted_at desc nulls last, q.name
        limit v_limit offset v_offset
      ) p
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

/*
 * One merchant's file for the review pane: who they are, where the
 * application stands, the checks that do not come from a document
 * (banking, duplicates) and the reviewers' notes. Activity is read by the
 * console from audit_activity_v, so the audit module's own rules apply.
 */
create or replace function public.rpc_merchant_verification_detail(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m public.merchant;
  v_a public.merchant_application;
  v_key text;
  v_state text;
  v_rejected integer;
  v_expired integer;
  v_branch jsonb;
  v_branches integer;
  v_area text;
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;

  select * into v_m from public.merchant where id = p_merchant_id;
  if v_m.id is null or not authz.works_merchant(p_merchant_id) then
    raise exception 'There is no such merchant here.' using errcode = 'P0002';
  end if;

  select * into v_a from public.merchant_application where merchant_id = p_merchant_id;
  v_key := coalesce(nullif(v_m.category_key, ''), v_m.category::text);

  select count(*) filter (where d.status = 'rejected'), count(*) filter (where d.status = 'expired')
  into v_rejected, v_expired
  from public.document d
  where d.owner_type = 'merchant' and d.owner_id = p_merchant_id and d.superseded_at is null;

  v_state := case
    when v_m.status = 'live' then 'live'
    when v_m.status not in ('applied', 'documents_pending', 'under_review') then v_m.status::text
    when v_a.review_state = 'rejected' then 'rejected'
    when v_a.review_state = 'changes_requested'
      or (v_a.submitted_revision is not null and v_a.submitted_revision <> v_a.revision)
      or v_rejected > 0 or v_expired > 0 then 'resubmission'
    when v_m.status = 'under_review' then 'under_review'
    else 'pending'
  end;

  select jsonb_build_object('name', br.name, 'address', br.address_text, 'zone', zo.name),
         nullif(concat_ws(', ', zo.name, c.name), '')
  into v_branch, v_area
  from public.merchant_branch br
  left join public.zone zo on zo.id = br.zone_id
  left join public.city c on c.id = v_m.city_id
  where br.merchant_id = p_merchant_id and br.deleted_at is null
  order by br.is_primary desc, br.sort nulls last, br.created_at
  limit 1;

  select count(*) into v_branches
  from public.merchant_branch br
  where br.merchant_id = p_merchant_id and br.deleted_at is null and br.closed_at is null;

  select jsonb_build_object(
    'id', v_m.id,
    'reference', 'MER-' || upper(right(replace(v_m.id::text, '-', ''), 6)),
    'name', coalesce(nullif(trim(v_m.trading_name), ''), v_m.legal_name),
    'trading_name', v_m.trading_name,
    'legal_name', v_m.legal_name,
    'category_key', v_key,
    'category_label', case
      when v_key = 'other' and nullif(trim(v_m.category_other), '') is not null then trim(v_m.category_other)
      else public.fn_merchant_category_label(v_key)
    end,
    'subcategory', v_m.subcategory,
    'photo_path', v_m.cover_photo_path,
    'area', coalesce(v_area, (select c.name from public.city c where c.id = v_m.city_id)),
    'city', (select c.name from public.city c where c.id = v_m.city_id),
    'contact_name', v_m.contact_name,
    'phone', v_m.contact_phone,
    'phone_verified', v_m.phone_verified_at is not null,
    'email', v_m.contact_email,
    'kra_pin', v_m.kra_pin,
    'status', v_m.status::text,
    'status_reason', v_m.status_reason,
    'state', v_state,
    'created_at', v_m.created_at,
    'submitted_at', case when v_a.merchant_id is not null then v_a.submitted_at
                         else coalesce(v_m.submitted_at, v_m.created_at) end,
    'went_live_at', v_m.went_live_at,
    'onboarding_source', v_m.onboarding_source,
    'branch', v_branch,
    'branches', v_branches,
    'application', case when v_a.merchant_id is null then null else jsonb_build_object(
      'review_state', v_a.review_state,
      'revision', v_a.revision,
      'submitted_revision', v_a.submitted_revision,
      'submitted_at', v_a.submitted_at,
      'review_reason', v_a.review_reason,
      'reviewed_at', v_a.reviewed_at,
      'reviewer', (select su.display_name from public.staff_user su where su.id = v_a.reviewed_by),
      'can_review', v_a.review_state = 'pending' and v_a.submitted_revision = v_a.revision
    ) end,
    'banking', jsonb_build_object(
      'rail', coalesce(
        (select ap.rail from public.merchant_application_payout ap where ap.merchant_id = p_merchant_id),
        v_m.payout_rail),
      'provided', exists (select 1 from public.merchant_application_payout ap where ap.merchant_id = p_merchant_id)
        or (v_m.payout_account is not null and v_m.payout_account <> '{}'::jsonb)
        or (v_m.settlement_account is not null and v_m.settlement_account <> '{}'::jsonb),
      'matched', case v_m.payout_name_lookup ->> 'matched' when 'true' then true when 'false' then false end
    ),
    'duplicates', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'status', x.status, 'match', x.match)
                       order by x.name)
      from (
        select o.id,
               coalesce(nullif(trim(o.trading_name), ''), o.legal_name) as name,
               o.status::text as status,
               concat_ws(', ',
                 case when nullif(trim(v_m.kra_pin), '') is not null
                       and upper(trim(o.kra_pin)) = upper(trim(v_m.kra_pin)) then 'KRA PIN' end,
                 case when length(regexp_replace(coalesce(v_m.contact_phone, ''), '\D', '', 'g')) >= 9
                       and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
                         = right(regexp_replace(v_m.contact_phone, '\D', '', 'g'), 9) then 'phone' end,
                 case when nullif(trim(v_m.contact_email), '') is not null
                       and lower(trim(o.contact_email)) = lower(trim(v_m.contact_email)) then 'email' end
               ) as match
        from public.merchant o
        where o.id <> p_merchant_id
          and o.deleted_at is null
          and o.parent_merchant_id is distinct from p_merchant_id
          and v_m.parent_merchant_id is distinct from o.id
          and (
            (nullif(trim(v_m.kra_pin), '') is not null and upper(trim(o.kra_pin)) = upper(trim(v_m.kra_pin)))
            or (length(regexp_replace(coalesce(v_m.contact_phone, ''), '\D', '', 'g')) >= 9
                and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
                  = right(regexp_replace(v_m.contact_phone, '\D', '', 'g'), 9))
            or (nullif(trim(v_m.contact_email), '') is not null
                and lower(trim(o.contact_email)) = lower(trim(v_m.contact_email)))
          )
        limit 5
      ) x
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('at', n.at, 'by', n.by, 'outcome', n.outcome, 'notes', n.notes)
                       order by n.at desc)
      from (
        select coalesce(r.finished_at, r.started_at) as at, su.display_name as by, r.outcome, r.notes
        from public.merchant_review r
        left join public.staff_user su on su.id = r.reviewer_id
        where r.merchant_id = p_merchant_id
          and nullif(trim(coalesce(r.notes, '')), '') is not null
        order by r.started_at desc
        limit 5
      ) n
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.fn_merchant_category_label(text) from public, anon, authenticated;
revoke all on function public.fn_merchant_verification_rows() from public, anon, authenticated;
revoke all on function public.rpc_merchant_verification_overview() from public, anon;
revoke all on function public.rpc_merchant_verification_list(text, text, text, integer, integer) from public, anon;
revoke all on function public.rpc_merchant_verification_detail(uuid) from public, anon;
grant execute on function public.rpc_merchant_verification_overview() to authenticated, service_role;
grant execute on function public.rpc_merchant_verification_list(text, text, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.rpc_merchant_verification_detail(uuid) to authenticated, service_role;
