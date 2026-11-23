-- Pets, NexG's 22nd category (20270223100100/0200): its specialties, the
-- retired Marketplace › Pet Supplies, the agreement, the registry and the VMD
-- licence every Pets merchant needs to go live.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select jsonb_array_length(subcategories) from public.category_config where category = 'pets' and is_active),
  8,
  'Pets is an active category with eight specialties'
);

select ok(
  not exists (
    select 1 from public.category_config cc, jsonb_array_elements(cc.subcategories) e(value)
    where cc.category = 'marketplace' and e.value ->> 'id' = 'pet_supplies'
  ) and exists (
    select 1 from public.category_config cc, jsonb_array_elements(cc.retired_subcategories) e(value)
    where cc.category = 'marketplace' and e.value ->> 'id' = 'pet_supplies'
  ),
  'Marketplace no longer offers Pet Supplies but keeps its definition'
);

select is(
  (select count(distinct sort)::int from public.category_config where is_active),
  (select count(*)::int from public.category_config where is_active),
  'every active category has its own place in the order'
);

select is(
  (select agreement_id from public.merchant_agreement_category where category = 'pets'),
  'marketplace',
  'Pets merchants accept the Marketplace agreement'
);

select ok(
  (
    select jsonb_typeof(r.profile_questions -> 'vet_clinics') = 'array'
      and r.taxonomy -> 'pets' ? 'veterinary_products'
    from public.merchant_application_registry r
    where r.revision = 'nexg-booking-2026-11-16.1'
  ),
  'the application registry knows the Pets specialties and their questions'
);

insert into public.merchant (id, legal_name, trading_name, category, category_key, subcategory, contact_name, contact_phone, contact_email, city_id, answers)
values (
  'dddddddd-0000-0000-0000-000000000142', 'Paws Limited', 'Paws', 'pets', 'pets', 'pet_shop_supplies',
  'Ann Owner', '+254700000142', 'paws@shop.example', (select id from public.city where slug = 'nairobi'), '{}'::jsonb
);

select ok(
  exists (
    select 1 from public.fn_merchant_required_docs('dddddddd-0000-0000-0000-000000000142') q
    where q.kind = 'vmd_licence' and q.essential
  ),
  'a Pets merchant must provide a VMD licence'
);

select ok(
  public.fn_merchant_go_live_missing('dddddddd-0000-0000-0000-000000000142') @> '[{"key":"documents"}]'::jsonb,
  'without the VMD licence a Pets merchant cannot go live'
);

insert into public.merchant (id, legal_name, trading_name, category, category_key, subcategory, contact_name, contact_phone, contact_email, city_id, answers)
values (
  'dddddddd-0000-0000-0000-000000000143', 'Shelf Limited', 'Shelf', 'marketplace', 'marketplace', 'general_retail',
  'Ann Owner', '+254700000143', 'shelf@shop.example', (select id from public.city where slug = 'nairobi'), '{}'::jsonb
);

select ok(
  not exists (
    select 1 from public.fn_merchant_required_docs('dddddddd-0000-0000-0000-000000000143') q
    where q.kind = 'vmd_licence'
  ),
  'other categories are not asked for a VMD licence'
);

select * from finish();
rollback;
