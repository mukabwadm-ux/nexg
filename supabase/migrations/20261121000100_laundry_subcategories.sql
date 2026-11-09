-- Laundry & Cleaning: twelve more subcategories.
--
-- Wash and fold, stain removal, clothing alterations and repairs, curtain
-- cleaning, carpet cleaning, wedding gown cleaning, corporate and uniform
-- laundry, fumigation, express laundry, laundry pickup and delivery, garment
-- care and finishing, and laundry order tracking. Professional dry cleaning,
-- laundry washing, ironing and pressing, and home cleaning already exist as
-- dry_cleaning, laundry, ironing and home_cleaning.
--
-- Each new subcategory reuses an existing profile's booking setup
-- (packages/booking-config/src/data/subcategory-variants.json). The
-- application registry gets a new revision, nexg-booking-2026-11-09.1, copied from
-- nexg-booking-2026-10-31.1 with the new IDs added to the taxonomy and given their
-- base profile's questions. The old revision stays enabled so applications
-- already in progress still validate.
--
-- Idempotent: safe to run more than once.

-- 1. Application registry revision.
insert into public.merchant_application_registry
  (revision, taxonomy, profile_questions, question_schemas, legacy_categories,
   legacy_compatibility_revision, enabled)
select
  'nexg-booking-2026-11-09.1',
  jsonb_set(
    r.taxonomy,
    '{laundry_cleaning}',
    (
      select jsonb_agg(id order by id)
      from (
        select jsonb_array_elements_text(r.taxonomy -> 'laundry_cleaning') as id
        union
        select jsonb_object_keys('{"wash_and_fold":"laundry","stain_removal":"dry_cleaning","clothing_alterations":"dry_cleaning","curtain_cleaning":"dry_cleaning","carpet_cleaning":"dry_cleaning","wedding_gown_cleaning":"dry_cleaning","corporate_uniform_laundry":"laundry","fumigation":"home_cleaning","express_laundry":"laundry","laundry_pickup_delivery":"laundry","garment_care":"ironing","laundry_order_tracking":"laundry"}'::jsonb)
      ) ids
    )
  ),
  r.profile_questions || (
    select jsonb_object_agg(v.key, r.profile_questions -> (v.value #>> '{}'))
    from jsonb_each('{"wash_and_fold":"laundry","stain_removal":"dry_cleaning","clothing_alterations":"dry_cleaning","curtain_cleaning":"dry_cleaning","carpet_cleaning":"dry_cleaning","wedding_gown_cleaning":"dry_cleaning","corporate_uniform_laundry":"laundry","fumigation":"home_cleaning","express_laundry":"laundry","laundry_pickup_delivery":"laundry","garment_care":"ironing","laundry_order_tracking":"laundry"}'::jsonb) v
  ),
  r.question_schemas,
  r.legacy_categories,
  r.legacy_compatibility_revision,
  true
from public.merchant_application_registry r
where r.revision = 'nexg-booking-2026-10-31.1'
on conflict (revision) do nothing;

do $$
begin
  if not exists (
    select 1 from public.merchant_application_registry
    where revision = 'nexg-booking-2026-11-09.1'
      and jsonb_array_length(taxonomy -> 'laundry_cleaning') = 17
  ) then
    raise exception 'Laundry registry revision nexg-booking-2026-11-09.1 was not created as expected.';
  end if;
end $$;

-- 2. Category configuration: the subcategory list onboarding and the
--    catalogue read, and the "What kind of business" options.
update public.category_config cc
set subcategories = cc.subcategories || (
  select coalesce(jsonb_agg(s.value), '[]'::jsonb)
  from jsonb_array_elements('[{"id":"wash_and_fold","name":"Wash and Fold","icon":"Shirt","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"stain_removal","name":"Stain Removal","icon":"Sparkles","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"clothing_alterations","name":"Clothing Alterations and Repairs","icon":"Scissors","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"curtain_cleaning","name":"Curtain Cleaning","icon":"Sparkles","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"carpet_cleaning","name":"Carpet Cleaning","icon":"Sparkles","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"wedding_gown_cleaning","name":"Wedding Gown Cleaning","icon":"Heart","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"corporate_uniform_laundry","name":"Corporate and Uniform Laundry","icon":"Briefcase","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"fumigation","name":"Fumigation","icon":"ShieldAlert","categoryId":"laundry_cleaning","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"express_laundry","name":"Express Laundry (2-hour service)","icon":"Shirt","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"laundry_pickup_delivery","name":"Laundry Pickup and Delivery","icon":"Truck","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"garment_care","name":"Garment Care and Finishing","icon":"Shirt","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"laundry_order_tracking","name":"Laundry Order Tracking","icon":"Map","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"}]'::jsonb) s(value)
  where not exists (
    select 1 from jsonb_array_elements(cc.subcategories) e(value)
    where e.value ->> 'id' = s.value ->> 'id'
  )
)
where cc.category = 'laundry_cleaning';

update public.category_config cc
set questions = (
  select jsonb_agg(
    case
      when q.value ->> 'key' = 'business_types' then jsonb_set(
        q.value,
        '{options}',
        (q.value -> 'options') || (
          select coalesce(jsonb_agg(o.value), '[]'::jsonb)
          from jsonb_array_elements('[{"value":"wash_and_fold","label":"Wash and Fold"},{"value":"stain_removal","label":"Stain Removal"},{"value":"clothing_alterations","label":"Clothing Alterations and Repairs"},{"value":"curtain_cleaning","label":"Curtain Cleaning"},{"value":"carpet_cleaning","label":"Carpet Cleaning"},{"value":"wedding_gown_cleaning","label":"Wedding Gown Cleaning"},{"value":"corporate_uniform_laundry","label":"Corporate and Uniform Laundry"},{"value":"fumigation","label":"Fumigation"},{"value":"express_laundry","label":"Express Laundry (2-hour service)"},{"value":"laundry_pickup_delivery","label":"Laundry Pickup and Delivery"},{"value":"garment_care","label":"Garment Care and Finishing"},{"value":"laundry_order_tracking","label":"Laundry Order Tracking"}]'::jsonb) o(value)
          where not exists (
            select 1 from jsonb_array_elements(q.value -> 'options') e(value)
            where e.value ->> 'value' = o.value ->> 'value'
          )
        )
      )
      else q.value
    end
    order by q.ordinality
  )
  from jsonb_array_elements(cc.questions) with ordinality q(value, ordinality)
)
where cc.category = 'laundry_cleaning'
  and jsonb_typeof(cc.questions) = 'array'
  and jsonb_array_length(cc.questions) > 0;
