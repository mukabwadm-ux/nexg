update public.category_config
set questions = questions || jsonb_build_array(
  jsonb_build_object(
    'key', 'adult_fulfillment_methods',
    'label', 'How will customers receive eligible orders?',
    'type', 'multi',
    'step', 2,
    'options', jsonb_build_array(
      jsonb_build_object('value', 'delivery', 'label', 'Delivery'),
      jsonb_build_object('value', 'customer_pickup', 'label', 'Customer pickup')
    )
  ),
  jsonb_build_object(
    'key', 'adult_handover_process',
    'label', 'What is your current customer eligibility check at handover?',
    'type', 'single',
    'step', 2,
    'hint', 'This records your current process. NexG will confirm applicable checks before approval.',
    'options', jsonb_build_array(
      jsonb_build_object('value', 'id_at_handover', 'label', 'Check accepted ID at handover'),
      jsonb_build_object('value', 'checkout_and_handover', 'label', 'Check at checkout and handover'),
      jsonb_build_object('value', 'review_with_nexg', 'label', 'Review the process with NexG')
    )
  ),
  jsonb_build_object(
    'key', 'adult_packaging_presentation',
    'label', 'How do you present outer packaging?',
    'type', 'single',
    'step', 2,
    'options', jsonb_build_array(
      jsonb_build_object('value', 'plain', 'label', 'Plain outer packaging'),
      jsonb_build_object('value', 'branded', 'label', 'Branded outer packaging'),
      jsonb_build_object('value', 'varies', 'label', 'It varies by item')
    )
  )
)
where category = 'adults_only';

update public.category_config
set subcategories = (
  select jsonb_agg(
    case subcategory.value ->> 'id'
      when 'restaurant' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'restaurant_service_style',
            'label', 'How do guests usually order at your restaurant?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'table_service', 'label', 'Table service'),
              jsonb_build_object('value', 'counter_service', 'label', 'Order at the counter'),
              jsonb_build_object('value', 'takeaway_delivery', 'label', 'Takeaway or delivery focused')
            )
          ),
          jsonb_build_object(
            'key', 'restaurant_menu_focus',
            'label', 'Which menu styles do you offer?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'local', 'label', 'Local cuisine'),
              jsonb_build_object('value', 'grill', 'label', 'Grill and barbecue'),
              jsonb_build_object('value', 'international', 'label', 'International dishes'),
              jsonb_build_object('value', 'vegetarian', 'label', 'Vegetarian options'),
              jsonb_build_object('value', 'other', 'label', 'Other')
            )
          )
        ),
        true
      )
      when 'fast_food' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'fast_food_combo_offers',
            'label', 'Do you offer meal combos?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'yes', 'label', 'Yes'),
              jsonb_build_object('value', 'no', 'label', 'No')
            )
          ),
          jsonb_build_object(
            'key', 'fast_food_handoff',
            'label', 'How are pickup orders handed over?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'counter', 'label', 'Front counter'),
              jsonb_build_object('value', 'shelf', 'label', 'Collection shelf'),
              jsonb_build_object('value', 'drive_through', 'label', 'Drive-through')
            )
          )
        ),
        true
      )
      when 'cafe' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'cafe_drink_sizes',
            'label', 'Which drink sizes do you serve?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'small', 'label', 'Small'),
              jsonb_build_object('value', 'regular', 'label', 'Regular'),
              jsonb_build_object('value', 'large', 'label', 'Large'),
              jsonb_build_object('value', 'other', 'label', 'Other sizes')
            )
          ),
          jsonb_build_object(
            'key', 'cafe_milk_options',
            'label', 'Which milk options can customers choose?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'dairy', 'label', 'Dairy'),
              jsonb_build_object('value', 'plant_based', 'label', 'Plant-based'),
              jsonb_build_object('value', 'other', 'label', 'Other options')
            )
          )
        ),
        true
      )
      when 'bakery' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'bakery_product_lines',
            'label', 'What do you bake?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'bread', 'label', 'Bread'),
              jsonb_build_object('value', 'pastries', 'label', 'Pastries'),
              jsonb_build_object('value', 'cakes', 'label', 'Cakes'),
              jsonb_build_object('value', 'custom_cakes', 'label', 'Custom cakes')
            )
          ),
          jsonb_build_object(
            'key', 'bakery_custom_orders',
            'label', 'Do you accept custom bakery orders?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'yes', 'label', 'Yes'),
              jsonb_build_object('value', 'no', 'label', 'No')
            )
          )
        ),
        true
      )
      when 'desserts' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'dessert_product_types',
            'label', 'What kinds of desserts do you offer?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'cakes', 'label', 'Cakes'),
              jsonb_build_object('value', 'pastries', 'label', 'Pastries'),
              jsonb_build_object('value', 'chilled', 'label', 'Chilled desserts'),
              jsonb_build_object('value', 'frozen', 'label', 'Frozen desserts')
            )
          ),
          jsonb_build_object(
            'key', 'dessert_temperature_handling',
            'label', 'Which storage conditions do your desserts need?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'chilled', 'label', 'Keep chilled'),
              jsonb_build_object('value', 'frozen', 'label', 'Keep frozen'),
              jsonb_build_object('value', 'ambient', 'label', 'Room temperature'),
              jsonb_build_object('value', 'varies', 'label', 'It varies by item')
            )
          )
        ),
        true
      )
      when 'juice_bar' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'juice_bar_products',
            'label', 'What drinks do you prepare?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'fresh_juice', 'label', 'Fresh juice'),
              jsonb_build_object('value', 'smoothies', 'label', 'Smoothies'),
              jsonb_build_object('value', 'bottled', 'label', 'Bottled drinks'),
              jsonb_build_object('value', 'other', 'label', 'Other drinks')
            )
          ),
          jsonb_build_object(
            'key', 'juice_bar_sizes',
            'label', 'Which serving sizes do you offer?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', '300ml', 'label', '300 ml'),
              jsonb_build_object('value', '500ml', 'label', '500 ml'),
              jsonb_build_object('value', '1l', 'label', '1 litre'),
              jsonb_build_object('value', 'other', 'label', 'Other sizes')
            )
          )
        ),
        true
      )
      when 'cloud_kitchen' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'cloud_kitchen_brand_relation',
            'label', 'Is the customer-facing brand different from the kitchen name?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'same', 'label', 'No, use the kitchen name'),
              jsonb_build_object('value', 'different', 'label', 'Yes, use a different brand')
            )
          ),
          jsonb_build_object(
            'key', 'cloud_kitchen_handoff',
            'label', 'Where should a delivery rider collect orders?',
            'type', 'single',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'dedicated_counter', 'label', 'Dedicated handoff counter'),
              jsonb_build_object('value', 'side_entrance', 'label', 'Side or kitchen entrance'),
              jsonb_build_object('value', 'call_on_arrival', 'label', 'Call on arrival')
            )
          )
        ),
        true
      )
      when 'catering' then jsonb_set(
        subcategory.value,
        '{questions}',
        coalesce(subcategory.value -> 'questions', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'catering_event_types',
            'label', 'What kinds of events do you cater?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'business', 'label', 'Business events'),
              jsonb_build_object('value', 'weddings', 'label', 'Weddings'),
              jsonb_build_object('value', 'private', 'label', 'Private celebrations'),
              jsonb_build_object('value', 'community', 'label', 'Community events'),
              jsonb_build_object('value', 'other', 'label', 'Other events')
            )
          ),
          jsonb_build_object(
            'key', 'catering_service_inclusions',
            'label', 'What can your catering service include?',
            'type', 'multi',
            'step', 2,
            'options', jsonb_build_array(
              jsonb_build_object('value', 'food_delivery', 'label', 'Food delivery'),
              jsonb_build_object('value', 'setup', 'label', 'Event setup'),
              jsonb_build_object('value', 'serving_staff', 'label', 'Serving staff'),
              jsonb_build_object('value', 'equipment', 'label', 'Serving equipment')
            )
          )
        ),
        true
      )
      else subcategory.value
    end
    order by subcategory.ordinality
  )
  from jsonb_array_elements(public.category_config.subcategories)
    with ordinality as subcategory(value, ordinality)
)
where category = 'restaurants_food';
