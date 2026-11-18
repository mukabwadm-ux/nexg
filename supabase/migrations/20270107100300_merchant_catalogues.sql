/*
 * Merchants → Catalogues: every merchant's catalogue in one list, the
 * figures above it, one catalogue open beside it, and a way for staff to
 * add a product with an audit trail.
 *
 * There is no catalogue record or catalogue status in the database: a
 * catalogue is a merchant's sections and items, an item is shown when it is
 * available, and the merchant shows in Discovery when it is live and
 * visible. So a catalogue's state is worked out:
 *
 *   under_review  a change the merchant asked for waits for staff
 *                 (catalogue_edit_request pending)
 *   not_live      the merchant is not live yet, so nobody can see it
 *   published     live, shown in Discovery, and at least one item available
 *   hidden        live, but hidden from Discovery or with nothing available
 *
 * Figures:
 *   Active catalogues      published ones.
 *   Total products         items in the catalogues listed.
 *   Pending review         pending catalogue_edit_request rows.
 *   Items requiring action items with no price or no photo, open price
 *                          drift flags, and photo tasks not done.
 *   Last sync              the last time a partner system changed an item
 *                          through the API (audit action
 *                          api.catalogue_item_updated); null when never.
 * Nothing records history for the first two, so no change is given.
 *
 * Access: the Merchants module, and each merchant for the people who may
 * work it (authz.works_merchant). Adding a product needs
 * authz.can_manage_merchants for the merchant's city, as writing catalogue
 * rows already does.
 *
 * Rollback:
 *   drop function if exists public.rpc_catalogue_item_add_staff(uuid, text, uuid, text, integer, text, boolean);
 *   drop function if exists public.rpc_merchant_catalogue_detail(uuid);
 *   drop function if exists public.rpc_merchant_catalogue_list(text[], text, text, integer, integer);
 *   drop function if exists public.rpc_merchant_catalogue_overview(text[]);
 *   drop function if exists public.fn_merchant_catalogue_rows();
 *   delete from audit.action_registry where action = 'catalogue.item_added';
 */

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('catalogue.item_added', 'merchants', 'notice', false, false, false, '{}', 'Staff added a product to a merchant catalogue')
on conflict (action) do nothing;

create or replace function public.fn_merchant_catalogue_rows()
returns table (
  merchant_id uuid,
  name text,
  category_key text,
  category_label text,
  photo_path text,
  area text,
  merchant_status text,
  explore_visible boolean,
  items integer,
  available integer,
  sections integer,
  needs_fix integer,
  pending_edits integer,
  open_flags integer,
  open_photo_tasks integer,
  updated_at timestamptz,
  state text
)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select
      m.id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as name,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey,
      m.category_other,
      m.cover_photo_path,
      m.city_id,
      m.status,
      m.explore_visible
    from public.merchant m
    where m.deleted_at is null
      and (
        exists (select 1 from public.catalogue_item i where i.merchant_id = m.id)
        or exists (select 1 from public.catalogue_section s where s.merchant_id = m.id)
      )
      and authz.works_merchant(m.id)
  ),
  agg as (
    select
      m.*,
      (select count(*) from public.catalogue_item i where i.merchant_id = m.id)::integer as items,
      (select count(*) from public.catalogue_item i where i.merchant_id = m.id and i.available)::integer as available,
      (select count(*) from public.catalogue_section s where s.merchant_id = m.id)::integer as sections,
      (select count(*) from public.catalogue_item i
        where i.merchant_id = m.id and (i.price_kes is null or i.photo_path is null))::integer as needs_fix,
      (select count(*) from public.catalogue_edit_request e
        where e.merchant_id = m.id and e.status = 'pending')::integer as pending_edits,
      (select count(*) from public.catalogue_price_flag f
        where f.merchant_id = m.id and f.status = 'open')::integer as open_flags,
      (select count(*) from public.catalogue_photo_task p
        where p.merchant_id = m.id and p.status in ('missing', 'booked'))::integer as open_photo_tasks,
      greatest(
        (select max(i.updated_at) from public.catalogue_item i where i.merchant_id = m.id),
        (select max(s.updated_at) from public.catalogue_section s where s.merchant_id = m.id)
      ) as changed_at
    from m
  )
  select
    a.id,
    a.name,
    a.ckey,
    case
      when a.ckey = 'other' and nullif(trim(a.category_other), '') is not null then trim(a.category_other)
      else public.fn_merchant_category_label(a.ckey)
    end,
    a.cover_photo_path,
    (
      select nullif(concat_ws(', ', zo.name, c.name), '')
      from public.merchant_branch br
      left join public.zone zo on zo.id = br.zone_id
      left join public.city c on c.id = a.city_id
      where br.merchant_id = a.id and br.deleted_at is null
      order by br.is_primary desc, br.sort nulls last, br.created_at
      limit 1
    ),
    a.status::text,
    a.explore_visible,
    a.items,
    a.available,
    a.sections,
    a.needs_fix,
    a.pending_edits,
    a.open_flags,
    a.open_photo_tasks,
    a.changed_at,
    case
      when a.pending_edits > 0 then 'under_review'
      when a.status <> 'live' then 'not_live'
      when a.explore_visible and a.available > 0 then 'published'
      else 'hidden'
    end
  from agg a
$$;

create or replace function public.rpc_merchant_catalogue_overview(p_keys text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;

  with q as (
    select * from public.fn_merchant_catalogue_rows() r
    where p_keys is null or r.category_key = any (p_keys)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'active', (select count(*) from q where q.state = 'published'),
      'items', (select coalesce(sum(q.items), 0) from q),
      'pending_review', (select coalesce(sum(q.pending_edits), 0) from q),
      'needs_action', (select coalesce(sum(q.needs_fix + q.open_flags + q.open_photo_tasks), 0) from q),
      'last_sync', (
        select max(ev.at)
        from audit.audit_event ev
        where ev.action = 'api.catalogue_item_updated'
          and (ev.after ->> 'merchant_id') in (select q.merchant_id::text from q)
      )
    ),
    'total', (select count(*) from q),
    'statuses', jsonb_build_object(
      'published', (select count(*) from q where q.state = 'published'),
      'under_review', (select count(*) from q where q.state = 'under_review'),
      'not_live', (select count(*) from q where q.state = 'not_live'),
      'hidden', (select count(*) from q where q.state = 'hidden')
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

create or replace function public.rpc_merchant_catalogue_list(
  p_keys text[] default null,
  p_status text default null,
  p_q text default null,
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
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('published', 'under_review', 'not_live', 'hidden') then
    raise exception 'Choose published, under review, not live or hidden.' using errcode = '22023';
  end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with q as (
    select r.*
    from public.fn_merchant_catalogue_rows() r
    where (p_keys is null or r.category_key = any (p_keys))
      and (p_status is null or r.state = p_status)
      and (
        v_like is null
        or r.name ilike v_like
        or exists (
          select 1 from public.catalogue_item i
          where i.merchant_id = r.merchant_id and i.name ilike v_like
        )
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from q),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.updated_at desc nulls last, p.name)
      from (
        select * from q
        order by q.updated_at desc nulls last, q.name
        limit v_limit offset v_offset
      ) p
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

/* One catalogue: its sections, items, modifiers and the open staff work. */
create or replace function public.rpc_merchant_catalogue_detail(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants')) then
    raise exception 'Only people who reach Merchants can see this.' using errcode = '42501';
  end if;

  select * into v_row from public.fn_merchant_catalogue_rows() r where r.merchant_id = p_merchant_id;
  if v_row.merchant_id is null then
    raise exception 'There is no such catalogue here.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'merchant', to_jsonb(v_row),
    'can_edit', authz.can_manage_merchants((select m.city_id from public.merchant m where m.id = p_merchant_id)),
    'modifiers', (
      select count(*) from public.modifier_group g
      where g.merchant_id = p_merchant_id and g.archived_at is null
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name,
        'items', (select count(*) from public.catalogue_item i where i.section_id = s.id),
        'available', (select count(*) from public.catalogue_item i where i.section_id = s.id and i.available)
      ) order by s.sort, s.name)
      from public.catalogue_section s
      where s.merchant_id = p_merchant_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'section', s.name, 'price_kes', i.price_kes,
        'available', i.available, 'highlighted', i.highlighted, 'photo_path', i.photo_path,
        'updated_at', i.updated_at
      ) order by i.highlighted desc, s.sort, i.sort, i.name)
      from (
        select * from public.catalogue_item i
        where i.merchant_id = p_merchant_id
        order by i.highlighted desc, i.sort, i.name
        limit 200
      ) i
      left join public.catalogue_section s on s.id = i.section_id
    ), '[]'::jsonb),
    'modifier_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', g.name, 'required', g.required,
        'options', (select count(*) from public.modifier_option o where o.group_id = g.id)
      ) order by g.sort, g.name)
      from public.modifier_group g
      where g.merchant_id = p_merchant_id and g.archived_at is null
    ), '[]'::jsonb),
    'pending_edits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'item', i.name, 'payload', e.payload, 'created_at', e.created_at
      ) order by e.created_at)
      from public.catalogue_edit_request e
      left join public.catalogue_item i on i.id = e.catalogue_item_id
      where e.merchant_id = p_merchant_id and e.status = 'pending'
    ), '[]'::jsonb),
    'price_flags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'item', i.name, 'app_price_kes', f.app_price_kes,
        'observed_price_kes', f.observed_price_kes, 'drift_pct', f.drift_pct, 'observed_at', f.observed_at
      ) order by f.observed_at desc)
      from public.catalogue_price_flag f
      left join public.catalogue_item i on i.id = f.catalogue_item_id
      where f.merchant_id = p_merchant_id and f.status = 'open'
    ), '[]'::jsonb),
    'photo_tasks', (
      select count(*) from public.catalogue_photo_task p
      where p.merchant_id = p_merchant_id and p.status in ('missing', 'booked')
    ),
    'imports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', ci.source, 'status', ci.status, 'items_found', ci.items_found, 'created_at', ci.created_at
      ) order by ci.created_at desc)
      from (
        select * from public.catalogue_import ci
        where ci.merchant_id = p_merchant_id
        order by ci.created_at desc
        limit 5
      ) ci
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

/*
 * Add Product: a staff member adds an item to a merchant's catalogue, in a
 * section that exists or a new one, and the change is audited. The item is
 * hidden until someone makes it available, unless asked otherwise.
 */
create or replace function public.rpc_catalogue_item_add_staff(
  p_merchant_id uuid,
  p_name text,
  p_section_id uuid default null,
  p_section_name text default null,
  p_price_kes integer default null,
  p_description text default null,
  p_available boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city uuid;
  v_section uuid := p_section_id;
  v_item uuid;
begin
  select m.city_id into v_city from public.merchant m where m.id = p_merchant_id and m.deleted_at is null;
  if not found then
    raise exception 'There is no such merchant.' using errcode = 'P0002';
  end if;
  if not authz.can_manage_merchants(v_city) then
    raise exception 'Only merchant operations staff for this city can add products.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Give the product a name of up to 120 characters.' using errcode = '22023';
  end if;
  if p_price_kes is not null and (p_price_kes < 0 or p_price_kes > 10000000) then
    raise exception 'Enter a price in shillings between 0 and 10,000,000.' using errcode = '22023';
  end if;

  if v_section is not null then
    perform 1 from public.catalogue_section s where s.id = v_section and s.merchant_id = p_merchant_id;
    if not found then
      raise exception 'That section is not in this catalogue.' using errcode = '22023';
    end if;
  else
    if nullif(trim(coalesce(p_section_name, '')), '') is null or length(trim(p_section_name)) > 80 then
      raise exception 'Choose a section, or name a new one of up to 80 characters.' using errcode = '22023';
    end if;
    insert into public.catalogue_section (merchant_id, name, sort)
    values (
      p_merchant_id,
      trim(p_section_name),
      coalesce((select max(s.sort) + 1 from public.catalogue_section s where s.merchant_id = p_merchant_id), 0)
    )
    returning id into v_section;
  end if;

  insert into public.catalogue_item (section_id, merchant_id, name, description, price_kes, available, sort)
  values (
    v_section,
    p_merchant_id,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_price_kes,
    coalesce(p_available, false),
    coalesce((select max(i.sort) + 1 from public.catalogue_item i where i.section_id = v_section), 0)
  )
  returning id into v_item;

  perform audit.log('staff'::public.actor_type, 'merchants', 'catalogue.item_added',
    p_target_type => 'merchant', p_target_id => p_merchant_id, p_city_id => v_city,
    p_after => jsonb_build_object('item_id', v_item, 'section_id', v_section, 'name', trim(p_name),
                                  'price_kes', p_price_kes, 'available', coalesce(p_available, false)));

  return v_item;
end;
$$;

revoke all on function public.fn_merchant_catalogue_rows() from public, anon, authenticated;
revoke all on function public.rpc_merchant_catalogue_overview(text[]) from public, anon;
revoke all on function public.rpc_merchant_catalogue_list(text[], text, text, integer, integer) from public, anon;
revoke all on function public.rpc_merchant_catalogue_detail(uuid) from public, anon;
revoke all on function public.rpc_catalogue_item_add_staff(uuid, text, uuid, text, integer, text, boolean)
  from public, anon;
grant execute on function public.rpc_merchant_catalogue_overview(text[]) to authenticated, service_role;
grant execute on function public.rpc_merchant_catalogue_list(text[], text, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.rpc_merchant_catalogue_detail(uuid) to authenticated, service_role;
grant execute on function public.rpc_catalogue_item_add_staff(uuid, text, uuid, text, integer, text, boolean)
  to authenticated, service_role;
