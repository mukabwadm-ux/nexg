-- Pets: NexG's 22nd merchant category (owner, 23 Nov 2026).
--
-- Matches packages/contracts/src/data/category-master.json. The category list
-- otherwise came from 20261226000200_master_categories.sql, which is applied
-- and no longer regenerated.
--
-- 1. category_config: a Pets row with eight specialties. Each copies its base
--    profile's entry (fields, workflow hints) under its own id and name, as
--    the master list does. Categories after Marketplace move down one place.
-- 2. Marketplace › Pet Supplies is retired: hidden from the picker, kept in
--    retired_subcategories so anything saved with it still reads. No merchant
--    used it on 23 Nov 2026.
-- 3. Pets merchants accept the Marketplace agreement (interim), as in
--    packages/contracts/src/merchant-agreements.ts.
-- 4. merchant_application_registry nexg-booking-2026-11-16.1 (the current
--    revision) gains the Pets taxonomy and each specialty's questions, copied
--    from its base. Existing entries are unchanged, so applications already
--    captured still validate.
-- 5. document_requirement: a Veterinary Medicines Directorate (VMD) licence
--    for every Pets merchant, with an expiry. Required and essential, so
--    fn_merchant_go_live_missing holds a Pets merchant back until it is in.
--
-- Idempotent: safe to run more than once.

create temporary table _pets (position int, id text, name text, base text) on commit drop;
insert into _pets values
  (1, 'pet_shop_supplies', 'Pet Shop & Supplies', 'general_retail'),
  (2, 'pet_food', 'Pet Food', 'general_retail'),
  (3, 'veterinary_products', 'Veterinary Products & Medicines', 'pharmacy_retail'),
  (4, 'vet_clinics', 'Vet Clinics', 'clinics'),
  (5, 'pet_grooming', 'Pet Grooming', 'haircare'),
  (6, 'pet_boarding_daycare', 'Pet Boarding & Daycare', 'reservations'),
  (7, 'pet_training', 'Pet Training', 'personal_training'),
  (8, 'pet_sitting_walking', 'Pet Sitting & Walking', 'home_cleaning');

-- Each base profile's entry, from whichever category holds it (current or retired).
create temporary table _pet_base on commit drop as
select distinct on (e.value ->> 'id') e.value ->> 'id' as id, e.value as entry
from public.category_config cc,
  jsonb_array_elements(coalesce(cc.subcategories, '[]'::jsonb) || coalesce(cc.retired_subcategories, '[]'::jsonb)) e(value)
where e.value ->> 'id' in (select base from _pets)
order by e.value ->> 'id', (cc.category = e.value ->> 'categoryId') desc;

do $$
declare missing text;
begin
  select string_agg(p.base, ', ') into missing
  from _pets p where not exists (select 1 from _pet_base b where b.id = p.base);
  if missing is not null then
    raise exception 'category_config has no entry for the Pets bases: %', missing;
  end if;
end $$;

-- 1. The Pets row. Order in the master list: after Marketplace.
update public.category_config
set sort = sort + 1, updated_at = now()
where category in ('tech_electronics', 'flowers_gifts', 'logistics_shipping')
  and sort <= 21
  and not exists (select 1 from public.category_config where category = 'pets');

insert into public.category_config (
  category, label, icon, card_kind, eta_style, questions, badge_rules, featured_eligible,
  extra_doc_rules, requires_ops_mapping, sort, color, bg, description, is_active,
  prep_time_required, subcategories, catalogue_example
)
select 'pets', 'Pets', 'PawPrint', 'products', 'minutes',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'business_types', 'step', 2, 'type', 'multi',
      'label', 'What kind of Pets business do you run?', 'hint', 'Select all that apply.',
      'options', (select jsonb_agg(jsonb_build_object('label', p.name, 'value', p.id) order by p.position) from _pets p)
    ),
    jsonb_build_object(
      'key', 'delivery_size', 'step', 2, 'type', 'single', 'required', false,
      'label', 'How do orders get to the customer?', 'hint', 'Bulky goods are not a rider job.',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Rider-size items', 'value', 'rider'),
        jsonb_build_object('label', 'Bulky, needs a vehicle or crew', 'value', 'bulky'),
        jsonb_build_object('label', 'Customer pickup or visit only', 'value', 'pickup')
      )
    )
  ),
  t.badge_rules, t.featured_eligible, '[]'::jsonb, t.requires_ops_mapping, 19,
  '#ea580c', '#fff7ed', 'Pet shops, food, vet care, grooming, boarding and training', true,
  false,
  (
    select jsonb_agg(
      b.entry || jsonb_build_object('id', p.id, 'name', p.name, 'categoryId', 'pets')
      order by p.position)
    from _pets p join _pet_base b on b.id = p.base
  ),
  jsonb_build_object(
    'name', 'Adult dry dog food · 15 kg',
    'description', 'Add the brand, the pet and its age, the pack size, and what is inside.',
    'pricePlaceholder', 'e.g. 6,500',
    'photoHint', 'Show the pack, the product, or the service at your shop.'
  )
from public.category_config t
where t.category = 'marketplace'
on conflict (category) do nothing;

-- 2. Marketplace › Pet Supplies: out of the picker, kept as a retired definition.
update public.category_config cc
set retired_subcategories = cc.retired_subcategories || coalesce((
      select jsonb_agg(e.value) from jsonb_array_elements(cc.subcategories) e(value)
      where e.value ->> 'id' = 'pet_supplies'
    ), '[]'::jsonb),
  subcategories = coalesce((
      select jsonb_agg(e.value order by e.ordinality)
      from jsonb_array_elements(cc.subcategories) with ordinality e(value, ordinality)
      where e.value ->> 'id' <> 'pet_supplies'
    ), '[]'::jsonb),
  questions = (
    select jsonb_agg(
      case when q.value ->> 'key' = 'business_types'
        then jsonb_set(q.value, '{options}', coalesce((
          select jsonb_agg(o.value order by o.ordinality)
          from jsonb_array_elements(q.value -> 'options') with ordinality o(value, ordinality)
          where o.value ->> 'value' <> 'pet_supplies'
        ), '[]'::jsonb))
        else q.value end
      order by q.ordinality)
    from jsonb_array_elements(cc.questions) with ordinality q(value, ordinality)
  ),
  description = 'Electronics, home, kitchen, baby, books and gifts',
  updated_at = now()
where cc.category = 'marketplace'
  and exists (select 1 from jsonb_array_elements(cc.subcategories) e(value) where e.value ->> 'id' = 'pet_supplies');

-- 3. The agreement Pets merchants accept.
insert into public.merchant_agreement_category (category, agreement_id, interim)
values ('pets', 'marketplace', true)
on conflict (category) do nothing;

-- 4. The application registry.
update public.merchant_application_registry r
set taxonomy = r.taxonomy || jsonb_build_object('pets', (select jsonb_agg(p.id order by p.id) from _pets p)),
  profile_questions = r.profile_questions || coalesce((
    select jsonb_object_agg(p.id, r.profile_questions -> p.base)
    from _pets p
    where not (r.profile_questions ? p.id) and r.profile_questions ? p.base
  ), '{}'::jsonb)
where r.revision = 'nexg-booking-2026-11-16.1';

-- 5. The VMD licence.
insert into public.document_requirement
  (owner_type, applies_when, kind, label, help_text, why_text, has_expiry, required, essential, sort)
values (
  'merchant', '{"category":["pets"]}'::jsonb, 'vmd_licence',
  'Veterinary Medicines Directorate (VMD) licence',
  'Your current licence from the Veterinary Medicines Directorate.',
  'Every Pets business needs it to trade · needed to go live',
  true, true, true, 65
)
on conflict (owner_type, kind) do nothing;

do $$
begin
  if not exists (
    select 1 from public.category_config
    where category = 'pets' and is_active and jsonb_array_length(subcategories) = 8
  ) then
    raise exception 'The Pets category was not created with its eight specialties.';
  end if;
  if exists (
    select 1 from public.category_config cc, jsonb_array_elements(cc.subcategories) e(value)
    where cc.category = 'marketplace' and e.value ->> 'id' = 'pet_supplies'
  ) then
    raise exception 'Marketplace still offers Pet Supplies.';
  end if;
  if (select count(*) from public.category_config where is_active) <> 22 then
    raise exception 'Expected 22 active categories.';
  end if;
  if (select count(distinct sort) from public.category_config where is_active) <> 22 then
    raise exception 'Two active categories share a place in the order.';
  end if;
  if (
    select count(*) from public.merchant_application_registry r, _pets p
    where r.revision = 'nexg-booking-2026-11-16.1'
      and r.taxonomy -> 'pets' ? p.id
      and jsonb_typeof(r.profile_questions -> p.id) = 'array'
  ) <> 8 then
    raise exception 'The registry does not hold the eight Pets specialties with their questions.';
  end if;
  if not exists (
    select 1 from public.document_requirement
    where owner_type = 'merchant' and kind = 'vmd_licence' and required and essential
  ) then
    raise exception 'The VMD licence requirement is missing.';
  end if;
end $$;
