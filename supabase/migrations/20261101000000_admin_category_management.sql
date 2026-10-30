alter table public.category_config
  alter column category type text using category::text,
  add column is_active boolean not null default true,
  add column image_path text,
  add column prep_time_required boolean not null default false,
  add column catalogue_example jsonb not null default '{}'::jsonb;

alter table public.merchant
  add column category_key text;

update public.category_config config
set catalogue_example = examples.example
from (
  values
    ('adults_only', '{"name":"Discreet wellness product","description":"Add the product type, size, and useful details for the guest.","pricePlaceholder":"e.g. 2,500","photoHint":"Show the product and its packaging clearly."}'::jsonb),
    ('airport_transfers', '{"name":"Airport pickup · sedan","description":"Add the route, passenger capacity, and what the fare includes.","pricePlaceholder":"e.g. 3,500","photoHint":"Show the vehicle guests will ride in."}'::jsonb),
    ('alcohol_beverages', '{"name":"Red wine · 750 ml","description":"Add the beverage type, size, and brand or origin.","pricePlaceholder":"e.g. 1,800","photoHint":"Show the bottle and its label."}'::jsonb),
    ('fashion_apparel', '{"name":"Linen shirt · size M","description":"Add the material, size or fit, and available colours.","pricePlaceholder":"e.g. 2,200","photoHint":"Show the item clearly, including its fit or details."}'::jsonb),
    ('beauty', '{"name":"Shea face cream · 50 ml","description":"Add the product size, key ingredients, and intended use.","pricePlaceholder":"e.g. 1,400","photoHint":"Show the product and its label."}'::jsonb),
    ('vehicle_rentals', '{"name":"Compact sedan · per day","description":"Add the vehicle model, rental period, and included terms.","pricePlaceholder":"e.g. 6,500","photoHint":"Show the available vehicle."}'::jsonb),
    ('experiences', '{"name":"Sunset dhow cruise · 2 guests","description":"Add the duration, group size, and what is included.","pricePlaceholder":"e.g. 4,500","photoHint":"Show the activity or destination guests can expect."}'::jsonb),
    ('financial_services', '{"name":"Tax filing consultation","description":"Add the service scope, duration, and what the fee covers.","pricePlaceholder":"e.g. 2,000","photoHint":"Show your team, workspace, or service in action."}'::jsonb),
    ('flowers_gifts', '{"name":"Seasonal bouquet · 12 stems","description":"Add the flower types, size, and wrapping included.","pricePlaceholder":"e.g. 3,000","photoHint":"Show the finished arrangement."}'::jsonb),
    ('restaurants_food', '{"name":"Nyama choma · half kilo","description":"Goat, served with kachumbari and ugali.","pricePlaceholder":"e.g. 850","photoHint":"Show the prepared dish as it is served."}'::jsonb),
    ('groceries_essentials', '{"name":"Maize flour · 2 kg","description":"Add the brand, pack size, and any useful product details.","pricePlaceholder":"e.g. 180","photoHint":"Show the product packaging and size."}'::jsonb),
    ('laundry_cleaning', '{"name":"Wash and fold · 5 kg","description":"Add the service quantity, turnaround, and included care.","pricePlaceholder":"e.g. 700","photoHint":"Show your service or the finished result."}'::jsonb),
    ('marketplace', '{"name":"Handwoven market basket","description":"Add the material, dimensions, and how it is made.","pricePlaceholder":"e.g. 1,600","photoHint":"Show the item from a clear angle."}'::jsonb),
    ('pharmacy', '{"name":"Digital thermometer","description":"Add the product model, pack contents, and key details.","pricePlaceholder":"e.g. 950","photoHint":"Show the product and its packaging."}'::jsonb),
    ('health', '{"name":"Nutrition consultation","description":"Add the appointment length, focus, and delivery format.","pricePlaceholder":"e.g. 2,500","photoHint":"Show your practice or service setting."}'::jsonb),
    ('tech_electronics', '{"name":"Wireless headphones","description":"Add the model, compatibility, and what is in the box.","pricePlaceholder":"e.g. 4,900","photoHint":"Show the product and included accessories."}'::jsonb),
    ('travel_tours', '{"name":"Nairobi day tour · 1 guest","description":"Add the duration, itinerary highlights, and inclusions.","pricePlaceholder":"e.g. 5,500","photoHint":"Show the destination or tour experience."}'::jsonb),
    ('vehicle_services', '{"name":"Exterior car wash","description":"Add the vehicle type, service steps, and estimated duration.","pricePlaceholder":"e.g. 800","photoHint":"Show your service or a finished vehicle."}'::jsonb),
    ('wellness', '{"name":"Yoga session · 60 minutes","description":"Add the session style, duration, and what guests need.","pricePlaceholder":"e.g. 1,500","photoHint":"Show the class or wellness space."}'::jsonb),
    ('concierge_services', '{"name":"Same-day personal errand","description":"Add the service area, what is included, and any limits.","pricePlaceholder":"e.g. 1,200","photoHint":"Show your team or service in action."}'::jsonb),
    ('logistics_shipping', '{"name":"Nairobi parcel delivery · small","description":"Add the parcel size, service area, and delivery option.","pricePlaceholder":"e.g. 500","photoHint":"Show the parcel size or delivery service."}'::jsonb)
) as examples(category, example)
where config.category = examples.category
  and config.catalogue_example = '{}'::jsonb;

update public.category_config config
set subcategories = (
  select jsonb_agg(
    case
      when examples.example is null then subcategory.value
      else jsonb_set(subcategory.value, '{catalogueExample}', examples.example, true)
    end
    order by subcategory.ordinality
  )
  from jsonb_array_elements(config.subcategories) with ordinality as subcategory(value, ordinality)
  left join (
    values
      ('adult_products', '{"name":"Discreet personal wellness item","description":"Include the product type, material, and size.","pricePlaceholder":"e.g. 2,500","photoHint":"Show the product with neutral, discreet packaging."}'::jsonb),
      ('adult_wellness', '{"name":"Adult wellness kit","description":"Describe the contents and any product-use details.","pricePlaceholder":"e.g. 1,800","photoHint":"Show the kit contents and packaging."}'::jsonb),
      ('cigarettes', '{"name":"Cigarettes · 20-pack","description":"Include the exact pack size and required label details.","pricePlaceholder":"e.g. 350","photoHint":"Show the pack and its label clearly."}'::jsonb),
      ('cigars', '{"name":"Single cigar","description":"Include the cigar type and individual or pack quantity.","pricePlaceholder":"e.g. 900","photoHint":"Show the cigar and its packaging."}'::jsonb),
      ('vapes', '{"name":"Reusable vape device","description":"Include the device type and product-specific details.","pricePlaceholder":"e.g. 2,800","photoHint":"Show the device and packaging without promotional claims."}'::jsonb),
      ('adult_accessories', '{"name":"Adult accessory","description":"Name the actual item and include size or material details.","pricePlaceholder":"e.g. 1,200","photoHint":"Show the item clearly with discreet presentation."}'::jsonb)
  ) as examples(subcategory_id, example)
    on examples.subcategory_id = subcategory.value ->> 'id'
)
where config.category = 'adults_only'
  and exists (
    select 1
    from jsonb_array_elements(config.subcategories) subcategory(value)
    where subcategory.value ->> 'id' in (
      'adult_products', 'adult_wellness', 'cigarettes', 'cigars', 'vapes', 'adult_accessories'
    )
      and not subcategory.value ? 'catalogueExample'
  );

update public.category_config
set is_active = false
where category in (
  'restaurant',
  'bar_liquor',
  'laundry',
  'florist',
  'beauty_fashion',
  'supermarket',
  'gift_shop',
  'airport'
);

update public.category_config
set prep_time_required = (category = 'restaurants_food');

update public.merchant
set category_key = case category::text
  when 'restaurant' then 'restaurants_food'
  when 'supermarket' then 'groceries_essentials'
  when 'beauty_fashion' then 'beauty'
  when 'bar_liquor' then 'alcohol_beverages'
  when 'florist' then 'flowers_gifts'
  when 'laundry' then 'laundry_cleaning'
  when 'gift_shop' then 'flowers_gifts'
  when 'airport' then 'airport_transfers'
  else category::text
end;

alter table public.merchant
  add constraint merchant_category_key_fkey
    foreign key (category_key) references public.category_config(category) on update cascade;

create index merchant_category_key_idx on public.merchant(category_key);

create or replace function public.tg_merchant_sync_category_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_key is null
     or (tg_op = 'UPDATE'
         and new.category is distinct from old.category
         and new.category_key is not distinct from old.category_key)
  then
    new.category_key := case new.category::text
      when 'restaurant' then 'restaurants_food'
      when 'supermarket' then 'groceries_essentials'
      when 'beauty_fashion' then 'beauty'
      when 'bar_liquor' then 'alcohol_beverages'
      when 'florist' then 'flowers_gifts'
      when 'laundry' then 'laundry_cleaning'
      when 'gift_shop' then 'flowers_gifts'
      when 'airport' then 'airport_transfers'
      else new.category::text
    end;
  end if;
  return new;
end;
$$;

create trigger merchant_sync_category_key
  before insert or update on public.merchant
  for each row execute function public.tg_merchant_sync_category_key();

create or replace function authz.can_manage_categories()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    where rg.staff_user_id = authz.staff_id()
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and r.key in ('merchant_ops', 'super_admin')
  )
$$;

revoke all on function authz.can_manage_categories() from public, anon;
grant execute on function authz.can_manage_categories() to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'category-images',
  'category-images',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy category_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'category-images');

create policy category_images_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'category-images'
    and authz.can_manage_categories()
  );

create policy category_images_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'category-images'
    and authz.can_manage_categories()
  )
  with check (
    bucket_id = 'category-images'
    and authz.can_manage_categories()
  );

create or replace function public.rpc_category_config_save(
  p_category text,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.category_config;
  v_is_new boolean;
  v_label text;
  v_icon text;
  v_card_kind text;
  v_eta_style text;
  v_color text;
  v_bg text;
  v_image_path text;
  v_questions jsonb;
  v_subcategories jsonb;
  v_rules jsonb;
  v_active boolean;
  v_doc_rule jsonb;
  v_reason text;
begin
  if not authz.can_manage_categories() then
    raise exception 'Merchant Ops or Super Admin access is required to manage categories.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_category !~ '^[a-z][a-z0-9_]{0,63}$'
     or jsonb_typeof(p_config) is distinct from 'object' then
    raise exception 'Enter a valid category ID and category configuration.'
      using errcode = 'check_violation';
  end if;

  select * into v_existing
  from public.category_config
  where category = p_category
  for update;
  v_is_new := not found;

  v_label := nullif(trim(p_config ->> 'label'), '');
  v_icon := coalesce(nullif(trim(p_config ->> 'icon'), ''), 'Store');
  v_card_kind := coalesce(p_config ->> 'card_kind', 'products');
  v_eta_style := coalesce(p_config ->> 'eta_style', 'minutes');
  v_color := nullif(p_config ->> 'color', '');
  v_bg := nullif(p_config ->> 'bg', '');
  v_image_path := nullif(p_config ->> 'image_path', '');
  v_questions := coalesce(p_config -> 'questions', '[]'::jsonb);
  v_subcategories := coalesce(p_config -> 'subcategories', '[]'::jsonb);
  v_rules := coalesce(p_config -> 'extra_doc_rules', '[]'::jsonb);
  v_active := coalesce((p_config ->> 'is_active')::boolean, true);
  v_reason := nullif(trim(p_config ->> 'description'), '');

  if v_label is null or length(v_label) > 100
     or length(v_icon) > 60
     or v_card_kind not in ('menu', 'services', 'products')
     or v_eta_style not in ('minutes', 'turnaround')
     or coalesce((p_config ->> 'sort')::integer, 0) < 0
     or jsonb_typeof(v_questions) is distinct from 'array'
     or jsonb_typeof(v_subcategories) is distinct from 'array'
     or jsonb_typeof(v_rules) is distinct from 'array'
     or jsonb_typeof(coalesce(p_config -> 'badge_rules', '{}'::jsonb)) is distinct from 'object'
     or jsonb_typeof(coalesce(p_config -> 'catalogue_example', '{}'::jsonb)) is distinct from 'object'
     or (v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$')
     or (v_bg is not null and v_bg !~ '^#[0-9A-Fa-f]{6}$')
     or (v_image_path is not null and v_image_path not like p_category || '/%')
  then
    raise exception 'Check the category name, display settings, image path, and configuration.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_questions) q(value)
    where coalesce(q.value ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,63}$'
       or nullif(trim(q.value ->> 'label'), '') is null
       or coalesce(q.value ->> 'type', '') not in ('single', 'multi', 'text')
       or (
         q.value ->> 'type' in ('single', 'multi')
         and (
           coalesce(jsonb_typeof(q.value -> 'options') <> 'array', true)
           or coalesce(jsonb_array_length(q.value -> 'options') = 0, true)
         )
       )
  ) or (
    select count(*) <> count(distinct q.value ->> 'key')
    from jsonb_array_elements(v_questions) q(value)
  ) then
    raise exception 'Each onboarding question needs a unique key, label, type, and options where applicable.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_subcategories) s(value)
    where jsonb_typeof(s.value) is distinct from 'object'
       or coalesce(s.value ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,63}$'
       or nullif(trim(s.value ->> 'name'), '') is null
       or (s.value ? 'fields' and jsonb_typeof(s.value -> 'fields') is distinct from 'array')
       or (s.value ? 'questions' and jsonb_typeof(s.value -> 'questions') is distinct from 'array')
  ) or (
    select count(*) <> count(distinct s.value ->> 'id')
    from jsonb_array_elements(v_subcategories) s(value)
  ) then
    raise exception 'Each subcategory needs a unique ID and a name.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_subcategories) s(value)
    cross join lateral jsonb_array_elements(coalesce(s.value -> 'questions', '[]'::jsonb)) q(value)
    where coalesce(q.value ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,63}$'
       or nullif(trim(q.value ->> 'label'), '') is null
       or coalesce(q.value ->> 'type', '') not in ('single', 'multi', 'text')
       or (
         q.value ->> 'type' in ('single', 'multi')
         and (
           coalesce(jsonb_typeof(q.value -> 'options') <> 'array', true)
           or coalesce(jsonb_array_length(q.value -> 'options') = 0, true)
         )
       )
  ) or exists (
    select s.value ->> 'id'
    from jsonb_array_elements(v_subcategories) s(value)
    cross join lateral jsonb_array_elements(coalesce(s.value -> 'questions', '[]'::jsonb)) q(value)
    group by s.value ->> 'id'
    having count(*) <> count(distinct q.value ->> 'key')
  ) then
    raise exception 'Specialty questions need unique keys, labels, types, and options where applicable.'
      using errcode = 'check_violation';
  end if;

  for v_doc_rule in select value from jsonb_array_elements(v_rules)
  loop
    if jsonb_typeof(v_doc_rule -> 'when') is distinct from 'object'
       or exists (
         select 1
         from jsonb_each(coalesce(v_doc_rule -> 'when', '{}'::jsonb)) condition
         where condition.key !~ '^[a-z][a-z0-9_]{0,63}$'
            or jsonb_typeof(condition.value) is distinct from 'string'
            or nullif(trim(condition.value #>> '{}'), '') is null
       )
       or not exists (
         select 1 from public.document_requirement dr
         where dr.owner_type = 'merchant'
           and dr.kind = v_doc_rule ->> 'doc'
       )
    then
      raise exception 'Choose an existing merchant document requirement and a valid answer condition.'
        using errcode = 'check_violation';
    end if;
  end loop;

  if not v_active and coalesce(v_existing.is_active, false)
     and (select count(*) from public.category_config where is_active) <= 1
  then
    raise exception 'At least one category must remain active.'
      using errcode = 'check_violation';
  end if;

  insert into public.category_config (
    category, label, icon, card_kind, eta_style, sort, featured_eligible,
    requires_ops_mapping, questions, badge_rules, extra_doc_rules,
    subcategories, color, bg, description, is_active, image_path,
    prep_time_required, catalogue_example
  )
  values (
    p_category,
    v_label,
    v_icon,
    v_card_kind,
    v_eta_style,
    coalesce((p_config ->> 'sort')::integer, 0),
    coalesce((p_config ->> 'featured_eligible')::boolean, true),
    coalesce((p_config ->> 'requires_ops_mapping')::boolean, false),
    v_questions,
    coalesce(p_config -> 'badge_rules', '{}'::jsonb),
    v_rules,
    v_subcategories,
    v_color,
    v_bg,
    v_reason,
    v_active,
    v_image_path,
    coalesce((p_config ->> 'prep_time_required')::boolean, false),
    coalesce(p_config -> 'catalogue_example', '{}'::jsonb)
  )
  on conflict (category) do update set
    label = excluded.label,
    icon = excluded.icon,
    card_kind = excluded.card_kind,
    eta_style = excluded.eta_style,
    sort = excluded.sort,
    featured_eligible = excluded.featured_eligible,
    requires_ops_mapping = excluded.requires_ops_mapping,
    questions = excluded.questions,
    badge_rules = excluded.badge_rules,
    extra_doc_rules = excluded.extra_doc_rules,
    subcategories = excluded.subcategories,
    color = excluded.color,
    bg = excluded.bg,
    description = excluded.description,
    is_active = excluded.is_active,
    image_path = excluded.image_path,
    prep_time_required = excluded.prep_time_required,
    catalogue_example = excluded.catalogue_example
  returning * into v_existing;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => case
      when v_is_new then 'merchant.category_created'
      when v_active then 'merchant.category_updated'
      else 'merchant.category_archived'
    end,
    p_target_type => 'category',
    p_target_id => null,
    p_after => jsonb_build_object(
      'category', p_category,
      'label', v_label,
      'is_active', v_active
    ),
    p_reason => coalesce(nullif(trim(p_config ->> 'reason'), ''), 'Category configuration saved.')
  );

  return jsonb_build_object('ok', true, 'category', to_jsonb(v_existing));
end;
$$;

revoke all on function public.rpc_category_config_save(text, jsonb) from public, anon;
grant execute on function public.rpc_category_config_save(text, jsonb) to authenticated, service_role;

create or replace function public.fn_merchant_required_docs(p_merchant_id uuid)
returns setof public.document_requirement
language sql
stable
set search_path = ''
as $$
  with subject as (
    select
      coalesce(
        nullif(m.category_key, 'other'),
        m.answers ->> 'nearest_category',
        m.category::text
      ) as cat,
      m.category::text as legacy_cat,
      m.answers as answers
    from public.merchant m
    where m.id = p_merchant_id
  ),
  triggered as (
    select r.value ->> 'doc' as kind
    from subject s
    join public.category_config cc on cc.category = s.cat
    cross join lateral jsonb_array_elements(cc.extra_doc_rules) as r(value)
    where public.fn_answer_matches(s.answers, r.value -> 'when')
  )
  select dr.*
  from public.document_requirement dr
  cross join subject s
  where dr.owner_type = 'merchant'
    and dr.required
    and (
      dr.applies_when = '{}'::jsonb
      or (
        (not dr.applies_when ? 'category'
         or dr.applies_when -> 'category' @> to_jsonb(s.cat)
         or dr.applies_when -> 'category' @> to_jsonb(s.legacy_cat))
        and (not dr.applies_when ? 'answer'
         or public.fn_answer_matches(s.answers, dr.applies_when -> 'answer'))
      )
      or exists (select 1 from triggered t where t.kind = dr.kind)
    )
  order by dr.sort;
$$;

create or replace function public.fn_merchant_readiness(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_category_key text;
  v_questions jsonb;
  v_subcategory_basics boolean := false;
  v_prep_time_required boolean := false;
  v_basics boolean := false;
  v_location boolean := false;
  v_hours boolean := false;
  v_documents boolean := false;
  v_payout boolean := false;
  v_items boolean := false;
  v_done integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;

  if (select auth.uid()) is not null
     and not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  v_category_key := coalesce(m.category_key, m.category::text);
  if v_category_key is not null then
    select cc.questions, cc.prep_time_required
      into v_questions, v_prep_time_required
    from public.category_config cc
    where cc.category = v_category_key;

    select coalesce(bool_and(
      m.answers ? (q.value ->> 'key')
      and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);

    if m.subcategory is not null then
      select coalesce(bool_and(
        not exists (
          select 1
          from jsonb_array_elements_text(coalesce(s.value -> 'fields', '[]'::jsonb)) f(key)
          where not (
            m.answers ? f.key
            and m.answers -> f.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
          )
        )
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(s.value -> 'questions', '[]'::jsonb)) q(value)
          where not (
            m.answers ? (q.value ->> 'key')
            and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
          )
        )
      ), false)
      into v_subcategory_basics
      from public.category_config cc
      cross join lateral jsonb_array_elements(cc.subcategories) s(value)
      where cc.category = v_category_key
        and s.value ->> 'id' = m.subcategory;

      v_basics := v_basics and v_subcategory_basics;
    else
      select not exists (
        select 1
        from public.category_config cc
        cross join lateral jsonb_array_elements(cc.subcategories) s(value)
        where cc.category = v_category_key
      ) into v_subcategory_basics;
      v_basics := v_basics and v_subcategory_basics;
    end if;
  end if;

  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id
      and b.is_primary
      and (
        b.zone_id is not null
        or (
          b.location is not null
          and exists (select 1 from public.fn_serving_city(b.location))
        )
      )
  ) into v_location;

  v_hours := m.hours_pattern is not null
    and (not coalesce(v_prep_time_required, false) or m.prep_minutes is not null);

  select coalesce(bool_and(
    exists (
      select 1 from public.document d
      where d.owner_type = 'merchant' and d.owner_id = m.id
        and d.requirement_id = r.id
        and d.status in ('uploaded', 'verified')
    )
  ), false)
  into v_documents
  from public.fn_merchant_required_docs(m.id) r
  where r.essential;

  v_payout := m.payout_rail is not null
    and m.payout_account is not null
    and m.payout_account <> '{}'::jsonb;

  select count(*) >= 5 into v_items
  from public.catalogue_item ci
  where ci.merchant_id = m.id and length(trim(ci.name)) > 0;

  v_done := (v_basics)::int + (v_location)::int + (v_hours)::int
          + (v_documents)::int + (v_payout)::int + (v_items)::int;

  return jsonb_build_object(
    'business_basics', v_basics,
    'location', v_location,
    'hours_prep', v_hours,
    'documents', v_documents,
    'payout', v_payout,
    'first_items', v_items,
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;

create or replace function public.rpc_merchant_set_category(
  p_merchant_id uuid,
  p_category text,
  p_answers jsonb default '{}',
  p_category_other text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_cfg public.category_config;
  v_legacy_category public.merchant_category;
  v_has_legacy_category boolean;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select * into v_cfg
  from public.category_config
  where category = p_category
    and (
      is_active
      or category = coalesce(m.category_key, m.category::text)
    );

  if v_cfg.category is null then
    raise exception 'We do not have that kind of business on the list.'
      using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'merchant_category'
      and e.enumlabel = p_category
  ) into v_has_legacy_category;

  if v_has_legacy_category then
    v_legacy_category := p_category::public.merchant_category;
  else
    v_legacy_category := 'other'::public.merchant_category;
  end if;

  update public.merchant
  set category = v_legacy_category,
      category_key = p_category,
      answers = case when coalesce(m.category_key, m.category::text) is distinct from p_category
                     then coalesce(p_answers, '{}'::jsonb)
                     else coalesce(p_answers, m.answers) end,
      category_other = nullif(trim(p_category_other), ''),
      requires_ops_mapping = v_cfg.requires_ops_mapping,
      price_band = coalesce(p_answers ->> 'spend_band', price_band),
      onboarding_step = greatest(onboarding_step, 3)
  where id = m.id;

  if coalesce(m.category_key, m.category::text) is distinct from p_category then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.category_set',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_before => jsonb_build_object('category', coalesce(m.category_key, m.category::text)),
      p_after => jsonb_build_object('category', p_category)
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$$;

revoke all on function public.rpc_merchant_set_category(uuid, public.merchant_category, jsonb, text)
  from public, anon, authenticated, service_role;
drop function public.rpc_merchant_set_category(uuid, public.merchant_category, jsonb, text);
revoke all on function public.rpc_merchant_set_category(uuid, text, jsonb, text) from public, anon;
grant execute on function public.rpc_merchant_set_category(uuid, text, jsonb, text)
  to authenticated, service_role;

create or replace function public.rpc_merchant_set_subcategory(
  p_merchant_id uuid,
  p_subcategory text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_category text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);
  v_category := coalesce(m.category_key, m.category::text);

  if nullif(p_subcategory, '') is not null and not exists (
    select 1
    from public.category_config category
    cross join lateral jsonb_array_elements(category.subcategories) as subcategory(value)
    where category.category = v_category
      and subcategory.value ->> 'id' = p_subcategory
  ) then
    raise exception 'Choose a specialty shown for this business category.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set subcategory = nullif(p_subcategory, ''),
      onboarding_step = greatest(onboarding_step, 2)
  where id = m.id;

  if m.subcategory is distinct from nullif(p_subcategory, '') then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.subcategory_set',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_before => jsonb_build_object('subcategory', m.subcategory),
      p_after => jsonb_build_object('subcategory', nullif(p_subcategory, ''))
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$$;

create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  case when m.health_band = 'green' then 'green' end as health_badge,
  m.subcategory,
  coalesce(
    (select active_zone.id from public.zone active_zone where active_zone.id = b.zone_id and active_zone.active),
    (select z.id from public.zone_for_point(b.longitude, b.latitude) z)
  ) as zone_id,
  m.category_key
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null;

grant select on public.merchant_public to anon, authenticated;

insert into public.console_module (key, label, section, href, sort, icon)
values ('categories', 'Categories', 'Partners', '/categories', 55, 'Tags')
on conflict (key) do update
set label = excluded.label,
    section = excluded.section,
    href = excluded.href,
    sort = excluded.sort,
    icon = excluded.icon;

insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'categories', 'full', null),
  ('merchant_ops', 'categories', 'full', 'Global merchant category configuration')
on conflict (role_key, module_key) do update
set level = excluded.level,
    note = excluded.note;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.category_created', 'merchants', 'notice', false, false, false, '{}', 'merchant category created'),
  ('merchant.category_updated', 'merchants', 'notice', false, false, false, '{}', 'merchant category configuration updated'),
  ('merchant.category_archived', 'merchants', 'high', true, false, false, '{}', 'merchant category archived from onboarding and public listings')
on conflict (action) do nothing;
