-- Shared catalogue categories for real flight and cinema operators.
-- Scheduled departures use capacity slots. Charters start with operator review.
with flight_types as (
  select jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', label, 'icon', icon, 'categoryId', 'flights',
      'fulfillmentHint', fulfillment, 'workflowHint', 'booking_dispatch',
      'fields', '[]'::jsonb, 'suggestedItemCount', 0, 'defaultWorkflow', workflow
    ) order by position
  ) as specialties,
  jsonb_agg(jsonb_build_object('value', id, 'label', label) order by position) as options
  from (values
    (1, 'helicopter_charters', 'Helicopter Charters', 'Plane', 'service_dispatch', 'Route and passengers → operator quote → request status'),
    (2, 'scenic_flights', 'Scenic Flights', 'Plane', 'ticket_delivery', 'Departure and passengers → capacity and price → booking'),
    (3, 'safari_flights', 'Safari Flights', 'Plane', 'ticket_delivery', 'Route and departure → capacity and price → booking'),
    (4, 'private_charters', 'Private Charters', 'Plane', 'service_dispatch', 'Route and passengers → operator quote → request status')
  ) as specialty(position, id, label, icon, fulfillment, workflow)
)
insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort, color, bg, description,
  subcategories, questions, featured_eligible
)
select 'flights', 'Flights', 'Plane', 'services', 'turnaround', 24,
  '#2563eb', '#eff6ff', 'Scenic and safari flights, helicopter charters, and private charters.',
  specialties,
  jsonb_build_array(jsonb_build_object(
    'key', 'business_types', 'label', 'What kinds of flights do you offer?',
    'type', 'multi', 'step', 2, 'hint', 'Select all that apply.', 'options', options
  )),
  false
from flight_types
on conflict (category) do nothing;

update public.category_config
set subcategories = subcategories || jsonb_build_array(jsonb_build_object(
  'id', 'cinemas', 'name', 'Cinemas', 'icon', 'Film', 'categoryId', 'experiences',
  'fulfillmentHint', 'ticket_delivery', 'workflowHint', 'booking_dispatch',
  'fields', '[]'::jsonb, 'suggestedItemCount', 0,
  'defaultWorkflow', 'Film and showing → choose seats → hold → cinema confirmation'
))
where category = 'experiences' and not subcategories @> '[{"id":"cinemas"}]'::jsonb;

update public.category_config as category
set questions = (
  select jsonb_agg(
    case
      when question.value ->> 'key' = 'business_types'
        and not (question.value -> 'options') @> '[{"value":"cinemas"}]'::jsonb
      then jsonb_set(question.value, '{options}', (question.value -> 'options') ||
        '[{"value":"cinemas","label":"Cinemas"}]'::jsonb)
      else question.value
    end order by question.ordinality
  )
  from jsonb_array_elements(category.questions) with ordinality as question(value, ordinality)
)
where category.category = 'experiences' and category.questions @> '[{"key":"business_types"}]'::jsonb;
