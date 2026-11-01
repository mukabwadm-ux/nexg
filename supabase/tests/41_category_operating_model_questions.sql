begin;
create extension if not exists pgtap;
select plan(6);

select ok(
  (select count(*) = 13 from public.category_config
   where category in ('vehicle_rentals','airport_transfers','experiences','travel_tours',
     'fashion_apparel','financial_services','logistics_shipping','marketplace',
     'tech_electronics','health','wellness','vehicle_services','concierge_services')
     and jsonb_array_length(questions) > 1),
  'every thin category gained operating-model questions'
);

select ok(
  not exists (
    select 1 from public.category_config c, jsonb_array_elements(c.questions) q
    where q->>'key' in ('rental_unit','turnaround_buffer','flight_tracking','departures',
      'size_system','provider_role','operator_role','item_condition','appointment_format',
      'booking_style','service_location','request_mode')
      and (q->>'required') is distinct from 'false'
  ),
  'new questions are all optional, so existing merchants keep their readiness'
);

select ok(
  (select count(*) = 1 from public.category_config c, jsonb_array_elements(c.questions) q
   where c.category = 'vehicle_rentals' and q->>'key' = 'business_types'),
  'existing business_types question is untouched'
);

select ok(
  (select prep_time_required = false from public.category_config where category = 'vehicle_rentals'),
  'rentals still have no preparation timer'
);

select ok(
  (select q->'when'->>'includes' = 'self_drive' from public.category_config c,
     jsonb_array_elements(c.questions) q
   where c.category = 'vehicle_rentals' and q->>'key' = 'renter_checks'),
  'renter checks appear only for self-drive'
);

select ok(
  (select count(*) = 0 from (
     select c.category, q->>'key' k from public.category_config c, jsonb_array_elements(c.questions) q
     group by 1, 2 having count(*) > 1) d),
  'no category has a duplicate question key'
);

select * from finish();
rollback;
