-- Complete bounded dated inventory for Discovery. No holds, quotes, or booking writes.
-- Same public unit must satisfy every predicate before the 1001-row overflow probe.
-- Additive: rpc_stay_search and native/web checkout remain unchanged.
create or replace function public.rpc_stay_filter_candidates_v1(
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_city_id uuid default null,
  p_area text default null,
  p_max_nightly_kes bigint default null,
  p_amenities text[] default '{}',
  p_min_bedrooms integer default null,
  p_property_id uuid default null,
  p_min_nightly_kes bigint default null,
  p_max_bedrooms integer default null,
  p_property_types text[] default '{}',
  p_city_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_count integer;
  v_amenities text[];
  v_request jsonb;
  v_property_types text[];
begin
  perform public.fn_stay_dates_check(p_check_in, p_check_out);
  if p_guests is null or p_guests not between 1 and 40 then
    raise exception 'Choose between 1 and 40 guests.' using errcode = '22023';
  end if;
  if p_area is not null and (btrim(p_area) = '' or char_length(p_area) > 120) then
    raise exception 'Choose a valid area.' using errcode = '22023';
  end if;
  if p_city_name is not null and (btrim(p_city_name) = '' or char_length(p_city_name) > 120) then
    raise exception 'Choose a valid city name.' using errcode = '22023';
  end if;
  if p_max_nightly_kes is not null and p_max_nightly_kes <= 0 then
    raise exception 'Nightly budget must be positive whole KES.' using errcode = '22023';
  end if;
  if p_min_bedrooms is not null and p_min_bedrooms not between 0 and 100 then
    raise exception 'Choose a valid bedroom count.' using errcode = '22023';
  end if;
  if p_min_nightly_kes is not null and (p_min_nightly_kes < 0 or (p_max_nightly_kes is not null and p_min_nightly_kes > p_max_nightly_kes)) then
    raise exception 'Choose a valid nightly range.' using errcode = '22023';
  end if;
  if p_max_bedrooms is not null and (p_max_bedrooms not between 0 and 100 or (p_min_bedrooms is not null and p_max_bedrooms < p_min_bedrooms)) then
    raise exception 'Choose a valid bedroom range.' using errcode = '22023';
  end if;
  if p_property_types is null or cardinality(p_property_types) > 32
     or coalesce(array_ndims(p_property_types), 1) <> 1
     or exists (select 1 from unnest(p_property_types) t where t is null or btrim(t) = '' or char_length(t) > 64) then
    raise exception 'Choose valid property types.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
    into v_property_types from unnest(p_property_types) t;
  if p_amenities is null or cardinality(p_amenities) > 32
     or coalesce(array_ndims(p_amenities), 1) <> 1
     or exists (select 1 from unnest(p_amenities) a where a is null or btrim(a) = '' or char_length(a) > 64) then
    raise exception 'Choose up to 32 valid amenity keys.' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct a order by a), '{}'::text[])
    into v_amenities from unnest(p_amenities) a;
  v_request := jsonb_build_object(
    'check_in', p_check_in, 'check_out', p_check_out, 'guests', p_guests,
    'city_id', p_city_id, 'area', case when p_area is null then null else lower(btrim(p_area)) end,
    'max_nightly_kes', p_max_nightly_kes, 'amenities', v_amenities,
    'min_bedrooms', p_min_bedrooms, 'property_id', p_property_id,
    'min_nightly_kes', p_min_nightly_kes, 'max_bedrooms', p_max_bedrooms, 'property_types', v_property_types,
    'city_name', case when p_city_name is null then null else lower(btrim(p_city_name)) end);

  -- STABLE shares the statement snapshot with the existing occupancy helper.
  -- Join both public views: live unit host AND live property host, published,
  -- not archived, and non-sample. Never combine unit A's capacity with B's dates.
  with candidates as materialized (
    select s.unit_id, s.property_id, s.nights, s.nightly_rate_kes,
           s.total_kes as room_subtotal_kes,
           u.max_guests, u.bedrooms,
           coalesce(p.amenities, '{}'::text[]) || coalesce(u.unit_amenities, '{}'::text[]) as amenities,
           jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug,
             'area', p.area, 'city_id', p.city_id, 'city_name', p.city_name,
             'property_type', p.kind, 'latitude', null, 'longitude', null,
             'photos', coalesce((select jsonb_agg(jsonb_build_object(
               'label', left(case when ph->>'placeholder' = 'true' then ph->>'caption' else ph->>'alt' end, 200),
               'cover', coalesce(ph->>'cover', 'false') = 'true'))
               from (select value ph from jsonb_array_elements(case when jsonb_typeof(p.photos) = 'array' then p.photos else '[]'::jsonb end) with ordinality
                     where jsonb_typeof(value) = 'object' and (value->>'placeholder' = 'true' or nullif(btrim(value->>'path'), '') is not null)
                     order by ordinality limit 24) photo), '[]'::jsonb)) as property
      from public.rpc_stay_search(p_check_in, p_check_out, p_guests, p_property_id) s
      join public.property_unit_public u on u.id = s.unit_id and u.property_id = s.property_id
      join public.property_public p on p.id = s.property_id
     where not u.is_sample and not p.is_sample
       and u.max_guests >= p_guests
       and s.nightly_rate_kes > 0
       and (p_city_id is null or p.city_id = p_city_id)
       and (p_city_name is null or lower(btrim(p.city_name)) = lower(btrim(p_city_name)))
       and (p_area is null or lower(btrim(p.area)) = lower(btrim(p_area)))
       and (p_max_nightly_kes is null or s.nightly_rate_kes <= p_max_nightly_kes)
       and (p_min_nightly_kes is null or s.nightly_rate_kes >= p_min_nightly_kes)
       and (p_max_bedrooms is null or u.bedrooms <= p_max_bedrooms)
       and (cardinality(v_property_types) = 0 or p.kind::text = any(v_property_types))
       and (p_min_bedrooms is null or u.bedrooms >= p_min_bedrooms)
       and (coalesce(p.amenities, '{}'::text[]) || coalesce(u.unit_amenities, '{}'::text[])) @> v_amenities
     order by s.nightly_rate_kes, s.unit_id
     limit 1001
  )
  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(c) order by c.nightly_rate_kes, c.unit_id), '[]'::jsonb)
    into v_count, v_items from candidates c;

  -- Do not return a partial list or total pretending to represent the full area.
  if v_count > 1000 then
    return jsonb_build_object('contract', 'stay-filter-candidates/1',
      'status', 'too_broad', 'complete', false, 'items', '[]'::jsonb,
      'limit', 1000, 'request', v_request, 'checked_at', statement_timestamp(),
      'held', false, 'booking', 'not_checked');
  end if;
  return jsonb_build_object('contract', 'stay-filter-candidates/1',
    'status', 'ok', 'complete', true, 'count', v_count, 'limit', 1000,
    'items', v_items, 'request', v_request, 'checked_at', statement_timestamp(),
    'currency', 'KES', 'price_basis', 'room_only',
    'held', false, 'booking', 'not_checked');
end;
$$;

revoke all on function public.rpc_stay_filter_candidates_v1(date,date,integer,uuid,text,bigint,text[],integer,uuid,bigint,integer,text[],text) from public;
grant execute on function public.rpc_stay_filter_candidates_v1(date,date,integer,uuid,text,bigint,text[],integer,uuid,bigint,integer,text[],text) to anon, authenticated;
comment on function public.rpc_stay_filter_candidates_v1(date,date,integer,uuid,text,bigint,text[],integer,uuid,bigint,integer,text[],text) is
  'Complete bounded public dated same-unit candidates. Overflow returns no partial inventory. Read only; no hold, quote or booking guarantee.';