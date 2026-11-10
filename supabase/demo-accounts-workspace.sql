-- Moves the demo merchants onto the new merchant workspace.
--
-- Run by hand in the Supabase SQL editor, once, after demo-accounts.sql.
-- Safe to run again: merchants that already have an application are skipped.
--
-- Which dashboard a merchant sees is decided by
-- authz.merchant_application_access: no merchant_application row means the
-- old dashboard. demo-accounts.sql created the merchants directly, so they
-- had none. This gives each one what a real applicant has: a business
-- activity (merchant.subcategory), an application at revision 1 with its
-- submission snapshot, and a review state:
--   live.<category>  approved  -> new workspace, "Workspace approved"
--   new.<category>   pending   -> new workspace, "Waiting for admin approval"
--
-- "Something else" has no subcategories in the registry, so its two demo
-- merchants stay on the old dashboard.
--
-- Note: once a merchant has an application, the database only lets the
-- merchant row change through application commands, and never for a live
-- merchant (tg_merchant_application_write_guard). So on the live.* demo
-- merchants, settings that save to the merchant record itself are refused.
-- That is how the platform treats approved merchants today, not a demo fault.

begin;

do $$
declare
  v_registry text;
  v_staff uuid;
  v_payload jsonb;
  v_owner uuid;
  m record;
begin
  select revision into v_registry from public.merchant_application_registry
   where enabled order by revision desc limit 1;
  if v_registry is null then raise exception 'No enabled merchant application registry.'; end if;
  select id into v_staff from public.staff_user order by created_at limit 1;

  for m in
    select mr.*, x.subcategory as pick,
           case when mr.contact_email like 'live.%' then 'live' else 'new' end as kind
      from public.merchant mr
      join (values
        ('adults_only', 'adult_wellness'),
        ('airport_transfers', 'airport_pickup'),
        ('alcohol_beverages', 'wine'),
        ('beauty', 'makeup'),
        ('concierge_services', 'personal_assistance'),
        ('experiences', 'recreation'),
        ('fashion_apparel', 'womens_fashion'),
        ('financial_services', 'forex'),
        ('flowers_gifts', 'flowers'),
        ('groceries_essentials', 'fresh_produce'),
        ('health', 'clinics'),
        ('laundry_cleaning', 'laundry'),
        ('logistics_shipping', 'road_freight'),
        ('marketplace', 'general_retail'),
        ('pharmacy', 'pharmacy_retail'),
        ('restaurants_food', 'restaurant'),
        ('tech_electronics', 'tech_accessories'),
        ('travel_tours', 'safaris'),
        ('vehicle_rentals', 'car_rental'),
        ('vehicle_services', 'car_wash'),
        ('wellness', 'spa')
      ) as x(category, subcategory) on x.category = mr.category::text
     where mr.id in (md5('demo-merchant-live-' || x.category)::uuid,
                     md5('demo-merchant-new-' || x.category)::uuid)
       and not exists (select 1 from public.merchant_application a where a.merchant_id = mr.id)
  loop
    -- The subcategory must be one the registry offers for this category.
    if not exists (select 1 from public.merchant_application_registry r
                    where r.revision = v_registry
                      and r.taxonomy -> m.category::text ? m.pick) then
      raise exception 'Subcategory % is not offered for % in %.', m.pick, m.category, v_registry;
    end if;

    -- Before the application exists: afterwards the write guard owns this row.
    update public.merchant set subcategory = m.pick where id = m.id;

    v_payload := jsonb_build_object(
      'business', jsonb_build_object(
        'name', m.trading_name,
        'email', m.contact_email,
        'phone', m.contact_phone,
        'firstName', split_part(m.contact_name, ' ', 1),
        'lastName', substr(m.contact_name, length(split_part(m.contact_name, ' ', 1)) + 2),
        'marketing', false,
        'registered', true,
        'branchCount', 1,
        'businessPhone', m.contact_phone,
        'sameBusinessPhone', true),
      'policies', jsonb_build_object('terms', true),
      'categoryId', m.category::text,
      'subcategories', jsonb_build_array(m.pick),
      'registryRevision', v_registry,
      'answersBySubcategory', '{}'::jsonb);

    select user_id into v_owner from public.merchant_user
     where merchant_id = m.id and role = 'owner' order by user_id limit 1;

    insert into public.merchant_application (
      merchant_id, revision, payload, review_state,
      submitted_revision, submitted_at, approved_revision, reviewed_by, reviewed_at)
    values (
      m.id, 1, v_payload,
      case when m.kind = 'live' then 'approved' else 'pending' end,
      1, coalesce(m.submitted_at, now()),
      case when m.kind = 'live' then 1 end,
      case when m.kind = 'live' then v_staff end,
      case when m.kind = 'live' then coalesce(m.went_live_at, now()) end);

    insert into public.merchant_application_submission (merchant_id, revision, payload, submitted_by, submitted_at)
    values (m.id, 1, v_payload, v_owner, coalesce(m.submitted_at, now()))
    on conflict do nothing;
  end loop;
end;
$$;

commit;

-- Check: each demo merchant, its activity and which dashboard it now opens.
select m.contact_email, m.subcategory, coalesce(a.review_state, 'none: old dashboard') as application
  from public.merchant m
  left join public.merchant_application a on a.merchant_id = m.id
 where m.contact_email ~ '^(live|new)\.' and m.contact_email like '%@nexgapp.com'
 order by m.contact_email;
