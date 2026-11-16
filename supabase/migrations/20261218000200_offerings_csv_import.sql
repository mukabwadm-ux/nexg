-- Offerings: catalogue sections that follow the editor, and CSV import.
--
-- 1. rpc_merchant_setup_offering_save put every offering in a section called
--    'Setup offerings' and ignored the editor's "Catalogue section" field, so
--    guests saw that heading and the field did nothing. The section now
--    decides where the offering's catalogue item sits (matched without regard
--    to case, added at the end of the list when new). A blank section leaves
--    an existing offering where it is, and a new one still goes to
--    'Setup offerings'.
--
-- 2. rpc_merchant_setup_offerings_import saves up to 500 offerings in one
--    transaction with the editor's own checks and write, so imported
--    offerings are ordinary offerings the merchant keeps editing. The save
--    is split in two for that: fn_merchant_setup_offering_authorize (who may
--    write, run once per command) and fn_merchant_setup_offering_write (one
--    offering: validation, version, section, catalogue item and detail).
--    rpc_merchant_setup_offering_save runs both, as before. Checking access
--    once per file instead of once per row keeps a 500-row file inside the
--    API's statement timeout. A published offering is switched off for its
--    save and back on after, as Publish does; one failing row rolls the
--    whole file back.
--
-- 3. The merchant application and setup commands have written audit events
--    that were never registered, so each one also raised an
--    audit.unknown_action alert for review. They are registered under
--    Merchants, with the new import.

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.application_started', 'merchants', 'info', 'Merchant application started'),
  ('merchant.application_saved', 'merchants', 'info', 'Merchant application saved'),
  ('merchant.application_submitted', 'merchants', 'info', 'Merchant application submitted for review'),
  ('merchant.application_reviewed', 'merchants', 'notice', 'Merchant application approved, sent back or rejected'),
  ('merchant.agreement_accepted', 'merchants', 'notice', 'Merchant accepted the merchant agreement for its category'),
  ('merchant.payout_declared', 'merchants', 'notice', 'Merchant declared its payout details'),
  ('merchant.setup_location_saved', 'merchants', 'info', 'Merchant saved a location'),
  ('merchant.setup_offering_adopted', 'merchants', 'info', 'Merchant opened an older catalogue entry as an offering'),
  ('merchant.setup_offering_saved', 'merchants', 'info', 'Merchant saved an offering'),
  ('merchant.offerings_imported', 'merchants', 'info', 'Merchant imported offerings from a CSV file')
on conflict (action) do nothing;

-- Who may write offerings: the application owner with setup access, while
-- the merchant is applying, under review or live. Locks the application and
-- the merchant, then checks again.
create function public.fn_merchant_setup_offering_authorize(p_merchant_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
end;
$$;

-- One offering, for a caller that has already run the authorization above.
create function public.fn_merchant_setup_offering_write(p_merchant_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_section uuid; v_section_name text; v_existing public.merchant_setup_offering_detail;
  v_version integer; v_price integer; v_now timestamptz := now(); v_data jsonb;
begin
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
     or coalesce(jsonb_typeof(p_data->'section'),'null') not in ('string','null')
     or length(trim(coalesce(p_data->>'section',''))) > 80
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
  -- The catalogue section guests see the offering under. A blank one leaves
  -- an existing offering where it is.
  v_section_name := nullif(regexp_replace(trim(coalesce(p_data->>'section','')),'\s+',' ','g'),'');
  if v_section_name is null and v_existing.item_id is null then
    v_section_name := 'Setup offerings';
  end if;
  if v_section_name is not null then
    select id into v_section from public.catalogue_section
      where merchant_id=p_merchant_id and lower(name)=lower(v_section_name)
      order by sort, created_at limit 1;
    if v_section is null then
      insert into public.catalogue_section (merchant_id,name,sort)
        values (p_merchant_id,v_section_name,
          coalesce((select max(sort)+1 from public.catalogue_section where merchant_id=p_merchant_id),0))
        returning id into v_section;
    end if;
  end if;
  if v_existing.item_id is null then
    insert into public.catalogue_item(id,merchant_id,section_id,name,description,price_kes,available)
    values(v_id,p_merchant_id,v_section,trim(p_data->>'name'),nullif(trim(p_data->>'description'),''),v_price,false);
  else
    update public.catalogue_item set name=trim(p_data->>'name'),
      description=nullif(trim(p_data->>'description'),''),price_kes=v_price,
      section_id=coalesce(v_section,section_id),
      available=case when v_existing.data->>'legacyCatalogue'='true' then available else false end
      where id=v_id and merchant_id=p_merchant_id and (
        available=false or (v_existing.data->>'legacyCatalogue'='true' and not exists
          (select 1 from public.merchant where id=p_merchant_id and status::text='live')));
    if not found then raise exception 'This draft is no longer available for setup editing.' using errcode='42501'; end if;
  end if;
  v_data := (p_data - 'legacyCatalogue') || jsonb_build_object('legacyCatalogue', coalesce(v_existing.data->>'legacyCatalogue'='true',false), 'name',trim(p_data->>'name'),'publication','draft',
                                          'version',v_version,'updatedAt',v_now);
  insert into public.merchant_setup_offering_detail(item_id,merchant_id,version,data,updated_at)
    values(v_id,p_merchant_id,v_version,v_data,v_now)
    on conflict(item_id) do update set version=excluded.version,data=excluded.data,updated_at=excluded.updated_at;
  return v_data;
end;
$$;

revoke all on function public.fn_merchant_setup_offering_authorize(uuid),
  public.fn_merchant_setup_offering_write(uuid, jsonb) from public, anon, authenticated;

create or replace function public.rpc_merchant_setup_offering_save(p_merchant_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_data jsonb;
begin
  perform public.fn_merchant_setup_offering_authorize(p_merchant_id);
  v_data := public.fn_merchant_setup_offering_write(p_merchant_id, p_data);
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.setup_offering_saved',p_target_type=>'catalogue_item',
    p_target_id=>(v_data->>'id')::uuid,
    p_after=>jsonb_build_object('merchant_id',p_merchant_id,'version',(v_data->>'version')::integer));
  return v_data;
end;
$$;

create function public.rpc_merchant_setup_offerings_import(p_merchant_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_was boolean;
  v_publish boolean;
  v_created integer := 0;
  v_updated integer := 0;
  v_published integer := 0;
  v_unpublished integer := 0;
begin
  perform public.fn_merchant_setup_offering_authorize(p_merchant_id);
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'Import from 1 to 500 offerings at a time.' using errcode = '22023';
  end if;

  for v_row in select r.value from jsonb_array_elements(p_rows) r loop
    if jsonb_typeof(v_row) is distinct from 'object'
       or jsonb_typeof(v_row->'data') is distinct from 'object'
       or coalesce(jsonb_typeof(v_row->'publish'), 'null') not in ('boolean', 'null') then
      raise exception 'Check the rows to import.' using errcode = '22023';
    end if;
    begin
      v_id := (v_row->'data'->>'id')::uuid;
    exception when others then
      raise exception 'Invalid offering identifier.' using errcode = '22023';
    end;

    -- Null for a new offering.
    v_was := null;
    select i.available into v_was
    from public.catalogue_item i
    where i.id = v_id and i.merchant_id = p_merchant_id;

    if v_was then
      update public.catalogue_item set available = false
      where id = v_id and merchant_id = p_merchant_id;
    end if;

    perform public.fn_merchant_setup_offering_write(p_merchant_id, v_row->'data');

    if v_was is null then v_created := v_created + 1; else v_updated := v_updated + 1; end if;

    -- No publish value keeps the offering as it was; a new one stays a draft.
    v_publish := coalesce((v_row->>'publish')::boolean, v_was, false);
    if v_publish then
      update public.catalogue_item set available = true
      where id = v_id and merchant_id = p_merchant_id;
      if not coalesce(v_was, false) then v_published := v_published + 1; end if;
    elsif v_was then
      v_unpublished := v_unpublished + 1;
    end if;
  end loop;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.offerings_imported',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_after => jsonb_build_object('created', v_created, 'updated', v_updated,
      'published', v_published, 'unpublished', v_unpublished)
  );

  return jsonb_build_object('created', v_created, 'updated', v_updated,
    'published', v_published, 'unpublished', v_unpublished);
end;
$$;

comment on function public.rpc_merchant_setup_offerings_import(uuid, jsonb) is
  'Saves up to 500 offerings in one transaction with the offering editor''s checks and write, keeping or setting each one''s publication.';

revoke all on function public.rpc_merchant_setup_offerings_import(uuid, jsonb) from public, anon;
grant execute on function public.rpc_merchant_setup_offerings_import(uuid, jsonb) to authenticated;
