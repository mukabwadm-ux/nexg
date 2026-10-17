-- Carry the existing category-specific onboarding questions and conditional
-- document rules onto their canonical taxonomy categories.
update public.category_config as canonical
set
  questions = legacy.questions,
  badge_rules = legacy.badge_rules,
  extra_doc_rules = legacy.extra_doc_rules
from (
  values
    ('restaurant', 'restaurants_food'),
    ('bar_liquor', 'alcohol_beverages'),
    ('laundry', 'laundry_cleaning'),
    ('supermarket', 'groceries_essentials'),
    ('beauty_fashion', 'beauty'),
    ('florist', 'flowers_gifts'),
    ('airport', 'airport_transfers')
) as aliases(legacy_category, canonical_category)
join public.category_config as legacy
  on legacy.category::text = aliases.legacy_category
where canonical.category::text = aliases.canonical_category
  and canonical.questions = '[]'::jsonb
  and canonical.badge_rules = '{}'::jsonb
  and canonical.extra_doc_rules = '[]'::jsonb;

-- These requirements were previously keyed only to legacy category names.
-- Keep the canonical food and beverage categories covered by the same rules.
update public.document_requirement
set applies_when = jsonb_set(
  applies_when,
  '{category}',
  (applies_when -> 'category') || to_jsonb('restaurants_food'::text)
)
where owner_type = 'merchant'
  and kind = 'food_handler_cert'
  and applies_when ? 'category'
  and not (applies_when -> 'category' @> to_jsonb('restaurants_food'::text));

update public.document_requirement
set applies_when = jsonb_set(
  applies_when,
  '{category}',
  (applies_when -> 'category') || to_jsonb('alcohol_beverages'::text)
)
where owner_type = 'merchant'
  and kind = 'liquor_licence'
  and applies_when ? 'category'
  and not (applies_when -> 'category' @> to_jsonb('alcohol_beverages'::text));

-- Subcategory is a separate write because the older generic step-save RPC
-- predates the taxonomy column and intentionally ignores unknown fields.
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
  v_category := case m.category::text
    when 'restaurant' then 'restaurants_food'
    when 'bar_liquor' then 'alcohol_beverages'
    when 'laundry' then 'laundry_cleaning'
    when 'supermarket' then 'groceries_essentials'
    when 'beauty_fashion' then 'beauty'
    when 'florist' then 'flowers_gifts'
    when 'airport' then 'airport_transfers'
    else m.category::text
  end;

  if p_subcategory is not null and not exists (
    select 1
    from public.category_config as category
    cross join lateral jsonb_array_elements(category.subcategories) as subcategory(value)
    where category.category::text = v_category
      and subcategory.value ->> 'id' = p_subcategory
  ) then
    raise exception 'Choose a specialty shown for this business category.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set subcategory = p_subcategory,
      onboarding_step = greatest(onboarding_step, 2)
  where id = m.id;

  if m.subcategory is distinct from p_subcategory then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.subcategory_set',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_before => jsonb_build_object('subcategory', m.subcategory),
      p_after => jsonb_build_object('subcategory', p_subcategory)
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$$;

revoke all on function public.rpc_merchant_set_subcategory(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_set_subcategory(uuid, text)
  to authenticated, service_role;
