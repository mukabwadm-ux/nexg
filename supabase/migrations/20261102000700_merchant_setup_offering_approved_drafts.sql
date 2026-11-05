create or replace function public.rpc_merchant_setup_offerings(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false)
     or not exists (select 1 from public.merchant where id=p_merchant_id
                    and status::text in ('applied','documents_pending','under_review','live')) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(d.data order by d.updated_at desc)
    from public.merchant_setup_offering_detail d where d.merchant_id=p_merchant_id), '[]'::jsonb);
end;
$$;


-- Recheck setup access while serializing with application review.
create or replace function public.rpc_merchant_setup_offering_save(p_merchant_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_section uuid; v_existing public.merchant_setup_offering_detail;
  v_version integer; v_price integer; v_now timestamptz := now(); v_data jsonb;
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false)
     or not exists (select 1 from public.merchant where id=p_merchant_id
                    and status::text in ('applied','documents_pending','under_review','live')) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  -- Serialize with application review and merchant lifecycle changes, then
  -- recheck authorization after acquiring the locks.
  perform 1 from public.merchant_application where merchant_id=p_merchant_id for update;
  perform 1 from public.merchant where id=p_merchant_id for update;
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false)
     or not exists (select 1 from public.merchant m join public.merchant_application a on a.merchant_id=m.id
       where m.id=p_merchant_id and m.status::text in ('applied','documents_pending','under_review','live')
         and a.review_state in ('draft','pending','changes_requested','approved')) then
    raise exception 'Setup draft editing is unavailable for this workspace.' using errcode='42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>131072
     or p_data->>'publication' is distinct from 'draft'
     or coalesce(p_data->>'schemaId','') !~ '^[A-Z][A-Z0-9_]{1,99}$'
     or coalesce(p_data->>'priceMode','') not in ('fixed','unit','quote','enquiry')
     or jsonb_typeof(p_data->'fields') is distinct from 'object'
     or jsonb_typeof(p_data->'attributes') is distinct from 'object'
     or jsonb_typeof(p_data->'sources') is distinct from 'object'
     or p_data#>>'{sources,details}' is distinct from 'nexg'
     or p_data#>>'{sources,price}' is distinct from 'nexg'
     or p_data#>>'{sources,availability}' is distinct from 'nexg'
     or jsonb_typeof(p_data->'resources') is distinct from 'array'
     or jsonb_typeof(p_data->'history') is distinct from 'array'
     or jsonb_typeof(p_data->'variants') is distinct from 'array'
     or length(trim(coalesce(p_data->>'name',''))) not between 1 and 150
     or length(coalesce(p_data->>'description','')) > 400
     or coalesce(p_data->>'version','') !~ '^[0-9]{1,8}$'
     or not exists (select 1 from public.merchant_application a
       where a.merchant_id=p_merchant_id and a.payload->'subcategories' ? (p_data->>'profileId')) then
    raise exception 'Check the offering details and selected activity.' using errcode='22023';
  end if;
  begin v_id := (p_data->>'id')::uuid;
  exception when others then raise exception 'Invalid offering identifier.' using errcode='22023'; end;
  if v_id is null then raise exception 'Invalid offering identifier.' using errcode='22023'; end if;
  select * into v_existing from public.merchant_setup_offering_detail where item_id=v_id for update;
  if found then
    if v_existing.merchant_id <> p_merchant_id then
      raise exception 'This offering is not in your workspace.' using errcode='42501';
    end if;
    if v_existing.version <> (p_data->>'version')::integer then
      raise exception 'This offering changed in another session. Reload it before saving.' using errcode='40001';
    end if;
    v_version := v_existing.version + 1;
  else
    if (p_data->>'version')::integer <> 0 or exists(select 1 from public.catalogue_item where id=v_id) then
      raise exception 'This offering cannot be created.' using errcode='40001';
    end if;
    v_version := 1;
  end if;
  -- The operational column stores only exact, positive whole shillings.
  if p_data->>'priceMode' in ('fixed','unit') and coalesce(p_data->>'price','') ~ '^[0-9]+([.]0{1,2})?$'
     and (p_data->>'price')::numeric between 1 and 1000000 then
    v_price := (p_data->>'price')::numeric::integer;
  end if;
  insert into public.catalogue_section (merchant_id,name) values (p_merchant_id,'Setup offerings')
    on conflict (merchant_id,name) do nothing;
  select id into v_section from public.catalogue_section where merchant_id=p_merchant_id and name='Setup offerings';
  if v_existing.item_id is null then
    insert into public.catalogue_item(id,merchant_id,section_id,name,description,price_kes,available)
    values(v_id,p_merchant_id,v_section,trim(p_data->>'name'),nullif(trim(p_data->>'description'),''),v_price,false);
  else
    update public.catalogue_item set name=trim(p_data->>'name'),
      description=nullif(trim(p_data->>'description'),''),price_kes=v_price,available=false
      where id=v_id and merchant_id=p_merchant_id and available=false;
    if not found then raise exception 'This draft is no longer available for setup editing.' using errcode='42501'; end if;
  end if;
  v_data := p_data || jsonb_build_object('name',trim(p_data->>'name'),'publication','draft',
                                          'version',v_version,'updatedAt',v_now);
  insert into public.merchant_setup_offering_detail(item_id,merchant_id,version,data,updated_at)
    values(v_id,p_merchant_id,v_version,v_data,v_now)
    on conflict(item_id) do update set version=excluded.version,data=excluded.data,updated_at=excluded.updated_at;
  return v_data;
end;
$$;
