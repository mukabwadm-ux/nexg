alter table public.catalogue_item
  add column portion_size text,
  add column ingredients text,
  add column allergens text[] not null default '{}',
  add column dietary_labels text[] not null default '{}',
  add column availability_notes text,
  add column handling_notes text,
  add column storage_guidance text,
  add column prep_time_minutes integer;

create or replace function public.fn_category_condition_matches(
  p_condition jsonb,
  p_answers jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_answer_key text;
  v_expected text;
  v_condition jsonb;
begin
  if p_condition is null or p_condition = '{}'::jsonb then
    return true;
  end if;

  if jsonb_typeof(p_condition) is distinct from 'object' then
    return false;
  end if;

  if p_condition ? 'any' then
    if jsonb_typeof(p_condition -> 'any') is distinct from 'array' then
      return false;
    end if;
    for v_condition in select value from jsonb_array_elements(p_condition -> 'any')
    loop
      if public.fn_category_condition_matches(v_condition, p_answers) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if p_condition ? 'all' then
    if jsonb_typeof(p_condition -> 'all') is distinct from 'array' then
      return false;
    end if;
    for v_condition in select value from jsonb_array_elements(p_condition -> 'all')
    loop
      if not public.fn_category_condition_matches(v_condition, p_answers) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  v_answer_key := p_condition ->> 'answer';
  v_expected := coalesce(p_condition ->> 'includes', p_condition ->> 'equals');
  if v_answer_key is null or v_expected is null or p_answers -> v_answer_key is null then
    return false;
  end if;

  if jsonb_typeof(p_answers -> v_answer_key) = 'array' then
    return (p_answers -> v_answer_key) @> jsonb_build_array(v_expected);
  end if;

  return p_answers ->> v_answer_key = v_expected;
end;
$$;

revoke all on function public.fn_category_condition_matches(jsonb, jsonb) from public, anon;
grant execute on function public.fn_category_condition_matches(jsonb, jsonb)
  to authenticated, service_role;

update public.category_config
set description = 'Restaurants, fast food, cafés, bakeries, desserts, juice bars, cloud kitchens and catering.',
    card_kind = 'menu',
    prep_time_required = true,
    catalogue_example = '{
      "name":"Nyama choma · half kilo",
      "description":"Add the ingredients, portion size, and useful details for the guest.",
      "pricePlaceholder":"e.g. 850",
      "photoHint":"Show the prepared dish as it is served."
    }'::jsonb,
    questions = jsonb_build_array(
      jsonb_build_object(
        'key', 'business_types',
        'label', 'Which food businesses do you run? Select all that apply.',
        'type', 'multi',
        'step', 2,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'restaurant', 'label', 'Restaurant'),
          jsonb_build_object('value', 'fast_food', 'label', 'Fast food'),
          jsonb_build_object('value', 'cafe', 'label', 'Café'),
          jsonb_build_object('value', 'bakery', 'label', 'Bakery'),
          jsonb_build_object('value', 'desserts', 'label', 'Desserts'),
          jsonb_build_object('value', 'juice_bar', 'label', 'Juice bar'),
          jsonb_build_object('value', 'cloud_kitchen', 'label', 'Cloud kitchen'),
          jsonb_build_object('value', 'catering', 'label', 'Catering')
        )
      ),
      jsonb_build_object(
        'key', 'fulfillment_methods',
        'label', 'How can customers order from you?',
        'type', 'multi',
        'step', 2,
        'hint', 'Choose every option you currently support.',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'delivery', 'label', 'Delivery'),
          jsonb_build_object('value', 'customer_pickup', 'label', 'Customer pickup'),
          jsonb_build_object('value', 'dine_in', 'label', 'Dine-in'),
          jsonb_build_object('value', 'advance_orders', 'label', 'Advance or scheduled orders'),
          jsonb_build_object('value', 'catering', 'label', 'Catering')
        )
      ),
      jsonb_build_object(
        'key', 'order_models',
        'label', 'What kinds of food orders do you accept?',
        'type', 'multi',
        'step', 2,
        'hint', 'Preparation time is requested only for made-to-order items.',
        'prepTimeWhen', jsonb_build_object('answer', 'order_models', 'includes', 'made_to_order'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'made_to_order', 'label', 'Prepared to order'),
          jsonb_build_object('value', 'ready_to_sell', 'label', 'Ready-to-sell items'),
          jsonb_build_object('value', 'preorder_custom', 'label', 'Preorders or custom items'),
          jsonb_build_object('value', 'catering', 'label', 'Catering orders')
        )
      ),
      jsonb_build_object(
        'key', 'food_style',
        'label', 'What cuisine or food style do you serve?',
        'type', 'text',
        'step', 2,
        'required', false,
        'hint', 'A short description helps guests understand your menu.'
      ),
      jsonb_build_object(
        'key', 'brand_description',
        'label', 'Describe your food business',
        'type', 'text',
        'step', 2,
        'required', false,
        'hint', 'Use the name guests know you by, especially if your kitchen has a different name.'
      ),
      jsonb_build_object(
        'key', 'holiday_hours',
        'label', 'How do your hours change on public holidays or special dates?',
        'type', 'text',
        'step', 4,
        'required', false,
        'hint', 'You can update customer-facing opening hours from your dashboard when dates are confirmed.'
      ),
      jsonb_build_object(
        'key', 'order_cancellation_process',
        'label', 'How should your team handle an order it cannot fulfill or needs to cancel?',
        'type', 'text',
        'step', 4,
        'required', false,
        'hint', 'This records your process for review; customer-facing cancellation controls are managed separately.'
      ),
      jsonb_build_object(
        'key', 'delivery_provider',
        'label', 'Who delivers your orders?',
        'type', 'single',
        'step', 4,
        'when', jsonb_build_object('answer', 'fulfillment_methods', 'includes', 'delivery'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'platform_riders', 'label', 'NexG riders'),
          jsonb_build_object('value', 'merchant_riders', 'label', 'Our own riders'),
          jsonb_build_object('value', 'both', 'label', 'Both')
        )
      ),
      jsonb_build_object(
        'key', 'busy_period_prep',
        'label', 'What preparation time should guests expect during busy periods?',
        'type', 'single',
        'step', 4,
        'required', false,
        'when', jsonb_build_object('answer', 'order_models', 'includes', 'made_to_order'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'same', 'label', 'About the same'),
          jsonb_build_object('value', 'add_15', 'label', 'Add about 15 minutes'),
          jsonb_build_object('value', 'add_30', 'label', 'Add about 30 minutes')
        )
      ),
      jsonb_build_object(
        'key', 'ready_item_availability',
        'label', 'How do you keep ready-to-sell items available?',
        'type', 'single',
        'step', 4,
        'when', jsonb_build_object('answer', 'order_models', 'includes', 'ready_to_sell'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'live_stock', 'label', 'Update stock as it changes'),
          jsonb_build_object('value', 'daily_list', 'label', 'Set a daily availability list'),
          jsonb_build_object('value', 'accept_confirm', 'label', 'Accept and confirm each order')
        )
      ),
      jsonb_build_object(
        'key', 'preorder_lead_time',
        'label', 'How much notice do preorders or custom items need?',
        'type', 'single',
        'step', 4,
        'when', jsonb_build_object('answer', 'order_models', 'includes', 'preorder_custom'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'same_day', 'label', 'Earlier the same day'),
          jsonb_build_object('value', 'one_day', 'label', 'At least one day'),
          jsonb_build_object('value', 'two_days', 'label', 'Two or more days')
        )
      ),
      jsonb_build_object(
        'key', 'preorder_cutoff',
        'label', 'When is the cutoff for a preorder?',
        'type', 'text',
        'step', 4,
        'when', jsonb_build_object('answer', 'order_models', 'includes', 'preorder_custom'),
        'hint', 'For example, orders for tomorrow must be placed by 4 pm today.'
      ),
      jsonb_build_object(
        'key', 'catering_notice',
        'label', 'How much advance notice do catering orders need?',
        'type', 'single',
        'step', 4,
        'when', jsonb_build_object('answer', 'business_types', 'includes', 'catering'),
        'options', jsonb_build_array(
          jsonb_build_object('value', 'one_day', 'label', 'At least one day'),
          jsonb_build_object('value', 'three_days', 'label', 'At least three days'),
          jsonb_build_object('value', 'one_week', 'label', 'One week or more')
        )
      ),
      jsonb_build_object(
        'key', 'catering_serving_limits',
        'label', 'What is your catering serving range and order-size limit?',
        'type', 'text',
        'step', 4,
        'when', jsonb_build_object('answer', 'business_types', 'includes', 'catering'),
        'hint', 'Include minimum and maximum servings or explain your capacity.'
      ),
      jsonb_build_object(
        'key', 'catering_setup_window',
        'label', 'What delivery or event setup window can you support?',
        'type', 'text',
        'step', 4,
        'when', jsonb_build_object('answer', 'business_types', 'includes', 'catering')
      ),
      jsonb_build_object(
        'key', 'catering_change_deadline',
        'label', 'How far ahead must customers request changes or cancel?',
        'type', 'text',
        'step', 4,
        'when', jsonb_build_object('answer', 'business_types', 'includes', 'catering')
      ),
      jsonb_build_object(
        'key', 'reservation_support',
        'label', 'Do you accept table reservations?',
        'type', 'single',
        'step', 4,
        'when', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object('answer', 'business_types', 'includes', 'restaurant'),
            jsonb_build_object('answer', 'fulfillment_methods', 'includes', 'dine_in')
          )
        ),
        'hint', 'This records your current practice; online reservations are not enabled by this form.',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'cloud_kitchen_brand',
        'label', 'What customer-facing brand should appear for this kitchen?',
        'type', 'text',
        'step', 4,
        'required', false,
        'when', jsonb_build_object('answer', 'business_types', 'includes', 'cloud_kitchen')
      ),
      jsonb_build_object(
        'key', 'delivery_handling',
        'label', 'How should delivery orders be packed and handled?',
        'type', 'multi',
        'step', 4,
        'when', jsonb_build_object('answer', 'fulfillment_methods', 'includes', 'delivery'),
        'hint', 'Select the handling needs that apply to your menu.',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'hot', 'label', 'Hot'),
          jsonb_build_object('value', 'cold', 'label', 'Cold'),
          jsonb_build_object('value', 'liquid', 'label', 'Liquid'),
          jsonb_build_object('value', 'fragile', 'label', 'Fragile')
        )
      ),
      jsonb_build_object(
        'key', 'unsafe_delivery_items',
        'label', 'Are there items that should not be delivered?',
        'type', 'text',
        'step', 4,
        'required', false,
        'when', jsonb_build_object('answer', 'fulfillment_methods', 'includes', 'delivery')
      ),
      jsonb_build_object(
        'key', 'food_safety_cleanliness',
        'label', 'Do you have routine cleaning and handwashing practices?',
        'type', 'single',
        'step', 5,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'food_safety_separation',
        'label', 'Do you keep raw foods separate from cooked and ready-to-eat foods?',
        'type', 'single',
        'step', 5,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'food_safety_cooking',
        'label', 'Do you cook food thoroughly and use safe cooking practices?',
        'type', 'single',
        'step', 5,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'food_safety_temperature',
        'label', 'Do you keep food at safe hot and cold holding temperatures?',
        'type', 'single',
        'step', 5,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'food_safety_water',
        'label', 'Do you use safe water and fresh, suitable ingredients?',
        'type', 'single',
        'step', 5,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'Yes'),
          jsonb_build_object('value', 'no', 'label', 'No')
        )
      ),
      jsonb_build_object(
        'key', 'allergen_information',
        'label', 'Confirm you will provide accurate ingredient and allergen information for every menu item.',
        'type', 'single',
        'step', 6,
        'hint', 'Item-level allergen details are listed for every menu item. This answer confirms that the details are accurate and available before checkout.',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'yes', 'label', 'I confirm')
        )
      )
    ),
    subcategories = (
      select jsonb_agg(
        (subcategory.value - 'fields' - 'workflow') || jsonb_build_object(
          'fields', '[]'::jsonb,
          'catalogueExample', case subcategory.value ->> 'id'
            when 'restaurant' then jsonb_build_object(
              'name', 'Nyama choma plate',
              'description', 'Describe the cut, sides, portion and ingredients.',
              'pricePlaceholder', 'e.g. 850',
              'photoHint', 'Show the plated meal as guests receive it.'
            )
            when 'fast_food' then jsonb_build_object(
              'name', 'Chicken burger combo',
              'description', 'List the sides, drink and any included extras.',
              'pricePlaceholder', 'e.g. 650',
              'photoHint', 'Show the complete meal and its portion.'
            )
            when 'cafe' then jsonb_build_object(
              'name', 'Cappuccino · regular',
              'description', 'Add the size, milk choices and served temperature.',
              'pricePlaceholder', 'e.g. 320',
              'photoHint', 'Show the drink in its serving cup.'
            )
            when 'bakery' then jsonb_build_object(
              'name', 'Sourdough loaf',
              'description', 'Include the weight, ingredients and whether it is preorder.',
              'pricePlaceholder', 'e.g. 500',
              'photoHint', 'Show the loaf whole and its typical serving.'
            )
            when 'desserts' then jsonb_build_object(
              'name', 'Mango cheesecake slice',
              'description', 'Describe the portion, toppings and chilled handling.',
              'pricePlaceholder', 'e.g. 450',
              'photoHint', 'Show the dessert portion ready to serve.'
            )
            when 'juice_bar' then jsonb_build_object(
              'name', 'Fresh passion juice · 500 ml',
              'description', 'List ingredients, size and whether it is sweetened.',
              'pricePlaceholder', 'e.g. 280',
              'photoHint', 'Show the drink in its sealed serving bottle.'
            )
            when 'cloud_kitchen' then jsonb_build_object(
              'name', 'Signature rice bowl',
              'description', 'Describe the bowl, portion and main ingredients.',
              'pricePlaceholder', 'e.g. 720',
              'photoHint', 'Show the dish as packed for delivery.'
            )
            when 'catering' then jsonb_build_object(
              'name', 'Office lunch package · serves 10',
              'description', 'State servings, menu contents and advance notice.',
              'pricePlaceholder', 'e.g. 8,500',
              'photoHint', 'Show a representative setup or serving package.'
            )
            else subcategory.value -> 'catalogueExample'
          end,
          'workflow', case subcategory.value ->> 'id'
            when 'restaurant' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Choose cuisine and ordering methods","Set dine-in, delivery and pickup availability","Add menu items, ingredients and allergen information"]},
                {"title":"Guest order","steps":["Guest selects menu items and available modifiers","Guest sees item details and the delivery or pickup estimate","Guest places the order"]},
                {"title":"Handoff","steps":["Merchant accepts and prepares the order","Merchant marks it ready for collection","Rider delivery and order status are coordinated by the platform"]}
              ],
              "policyNote":"This onboarding records the intended restaurant workflow. Reservations, item-level allergen display at checkout, and rider dispatch timing require separate platform support."
            }'::jsonb
            when 'fast_food' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Configure combo choices and paid extras in the menu","Set rapid handoff and packaging details","Mark sold-out items as unavailable"]},
                {"title":"Guest order","steps":["Guest chooses a meal and available options","Guest sees price and item details before checkout","Guest chooses delivery or pickup"]},
                {"title":"Handoff","steps":["Merchant accepts and prepares the order","Merchant marks the packed order ready","Rider collects it for delivery where selected"]}
              ],
              "policyNote":"Menu modifiers and rapid dispatch coordination must be enabled in the catalogue and order platform before these steps are live."
            }'::jsonb
            when 'cafe' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Add drinks, food, sizes and available milk or temperature choices","Set which items are made to order","Add ingredient and allergen details"]},
                {"title":"Guest order","steps":["Guest chooses available sizes and customizations","Guest reviews item details and price","Guest selects delivery, pickup or dine-in where supported"]},
                {"title":"Handoff","steps":["Merchant prepares made-to-order drinks and food","Merchant marks delivery orders ready for collection","Guest receives the order through the selected supported channel"]}
              ],
              "policyNote":"Dine-in ordering and item customization require separate guest ordering support before they can be offered online."
            }'::jsonb
            when 'bakery' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Mark products as ready stock or preorder","Set custom cake details, lead time and order cutoff","Add serving, storage and ingredient information"]},
                {"title":"Guest order","steps":["Guest sees whether an item is in stock or requires advance notice","Guest confirms custom details and collection date","Guest reviews price and availability before ordering"]},
                {"title":"Handoff","steps":["Bakery confirms the preorder and agreed date","Bakery prepares and packs the item safely","Item is collected or delivered in the confirmed window"]}
              ],
              "policyNote":"Date-specific preorder checkout and custom-item configuration require separate order-platform support."
            }'::jsonb
            when 'desserts' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Add portions, sizes and customization details","Identify items needing chilled or careful handling","Provide ingredient and allergen information"]},
                {"title":"Guest order","steps":["Guest chooses dessert size and available customization","Guest sees handling notes and item details","Guest chooses a supported fulfillment method"]},
                {"title":"Handoff","steps":["Merchant prepares and packs temperature-sensitive items","Merchant marks the order ready","Rider follows the configured handling instructions"]}
              ],
              "policyNote":"Item-level handling instructions and temperature-aware rider handoff need platform support before they are operational."
            }'::jsonb
            when 'juice_bar' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Add ingredients, sizes and available add-ons","Mark made-to-order drinks and chilled handling needs","Use dietary labels only when the claim is accurate"]}
                ,{"title":"Guest order","steps":["Guest reviews ingredients, allergens and size","Guest selects available add-ons","Guest chooses delivery or pickup where supported"]}
                ,{"title":"Handoff","steps":["Merchant prepares the drink to order","Merchant seals the drink for safe transport","Rider collects and delivers the order"]}
              ],
              "policyNote":"Configurable menu add-ons and safe liquid packaging must be supported by catalogue and order tools before the workflow is live."
            }'::jsonb
            when 'cloud_kitchen' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Set the customer-facing brand separately from the kitchen name","Record the correct rider collection location and instructions","Add the menu, hours and available order models"]}
                ,{"title":"Guest order","steps":["Guest browses the public brand and menu","Guest selects available items and a supported fulfillment method","Guest sees the customer-facing merchant details"]}
                ,{"title":"Handoff","steps":["Kitchen accepts and prepares the order","Kitchen marks it ready at the correct collection point","Rider receives the kitchen pickup instructions"]}
              ],
              "policyNote":"Multiple brands, customer-facing name separation and precise rider handoff depend on storefront and dispatch support."
            }'::jsonb
            when 'catering' then '{
              "status":"designed",
              "groups":[
                {"title":"Setup","steps":["Set advance notice, serving range and order-size limits","Describe delivery or event setup windows","State change and cancellation deadlines"]}
                ,{"title":"Guest order","steps":["Guest provides event date, quantities and delivery or setup needs","Merchant confirms feasibility and the final quote","Guest approves the confirmed order and terms"]}
                ,{"title":"Handoff","steps":["Merchant prepares the confirmed catering order","Merchant coordinates the agreed delivery or setup window","Guest receives the order for the scheduled event"]}
              ],
              "policyNote":"Scheduled event dates, quotes, deposits and catering-specific change terms require separate order and payment support."
            }'::jsonb
            else '{}'::jsonb
          end
        )
        order by subcategory.ordinality
      )
      from jsonb_array_elements(public.category_config.subcategories)
        with ordinality as subcategory(value, ordinality)
    )
where category = 'restaurants_food';

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
      not coalesce((q.value ->> 'required')::boolean, true)
      or not public.fn_category_condition_matches(q.value -> 'when', m.answers)
      or (
        m.answers ? (q.value ->> 'key')
        and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      )
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
          where coalesce((q.value ->> 'required')::boolean, true)
            and public.fn_category_condition_matches(q.value -> 'when', m.answers)
            and not (
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

    if v_prep_time_required then
      select coalesce(
        public.fn_category_condition_matches(
          (select q.value -> 'prepTimeWhen'
           from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) q(value)
           where q.value ? 'prepTimeWhen'
           limit 1),
          m.answers
        ),
        true
      )
      into v_prep_time_required;
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

comment on function public.fn_category_condition_matches(jsonb, jsonb) is
  'Evaluates category-question display and preparation-time conditions against merchant answers.';

comment on column public.catalogue_item.allergens is
  'Merchant-declared allergens for guest display. Do not infer this list from item names.';
comment on column public.catalogue_item.dietary_labels is
  'Dietary labels the merchant can substantiate for the item.';
