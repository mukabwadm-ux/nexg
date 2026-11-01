/*
 * Category-specific operating-model questions for the categories that had a
 * single question (business_types) and nothing about how the business works.
 *
 * Rentals, transfers, experiences, tours, appointments, freight and retail
 * each run on a different model (fleet calendar, dated capacity, quote-first,
 * stock dispatch). These questions collect that model.
 *
 * Additive and idempotent:
 *  - a question is appended only when its key is not already on the category;
 *  - every new question is required:false, so merchants who already passed
 *    readiness do not fall back, and drafts stay resumable;
 *  - no existing key, label or answer is touched.
 *
 * Rollback: remove the appended keys, e.g.
 *   update category_config set questions = (
 *     select coalesce(jsonb_agg(q), '[]') from jsonb_array_elements(questions) q
 *     where not (q->>'key' = any (array['<key>', ...]))
 *   ) where category = '<category>';
 */

create or replace function pg_temp.q(
  p_key text, p_label text, p_type text, p_step int, p_hint text,
  p_options text[] default null, p_when jsonb default null
) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'key', p_key, 'label', p_label, 'type', p_type, 'step', p_step,
    'hint', p_hint, 'required', false,
    'options', (
      select jsonb_agg(jsonb_build_object(
        'value', split_part(o, ':', 1), 'label', split_part(o, ':', 2)
      ) order by n)
      from unnest(p_options) with ordinality t(o, n)
    ),
    'when', p_when
  ))
$$;

create or replace function pg_temp.add_questions(p_category text, p_new jsonb)
returns void language sql as $$
  update public.category_config c
  set questions = c.questions || (
    select coalesce(jsonb_agg(n), '[]'::jsonb)
    from jsonb_array_elements(p_new) n
    where not exists (
      select 1 from jsonb_array_elements(c.questions) e where e->>'key' = n->>'key'
    )
  )
  where c.category = p_category;
$$;

select pg_temp.add_questions('vehicle_rentals', jsonb_build_array(
  pg_temp.q('rental_unit', 'How do you charge for a rental?', 'single', 4,
    'Rentals run on a fleet calendar, not a preparation timer.',
    array['hour:Per hour','day:Per day','week:Per week','month:Per month']),
  pg_temp.q('rental_terms', 'What do renters need to know up front?', 'multi', 4,
    'Shown to the customer before they book.',
    array['deposit:Deposit required','mileage_limit:Mileage limit','insurance_included:Insurance included','driver_available:Driver available','one_way:One-way return allowed']),
  pg_temp.q('turnaround_buffer', 'Gap needed between two rentals of the same vehicle', 'single', 4,
    'Cleaning, inspection and refuelling time. Vehicles are held back from booking during this gap.',
    array['none:None','1h:1 hour','3h:3 hours','half_day:Half a day','full_day:A full day']),
  pg_temp.q('booking_notice', 'How much notice do you need?', 'single', 4, null,
    array['same_day:Same day','24h:24 hours','48h:48 hours','week:A week']),
  pg_temp.q('renter_checks', 'Checks you make on a self-drive renter', 'multi', 5,
    'We do not verify licences for you; this is what you tell customers you check.',
    array['licence:Driving licence','id:National ID or passport','deposit_hold:Deposit hold','inspection:Pre and post inspection'],
    jsonb_build_object('answer','business_types','includes','self_drive'))
));

select pg_temp.add_questions('airport_transfers', jsonb_build_array(
  pg_temp.q('airports_served', 'Which airports do you serve?', 'multi', 2, null,
    array['jkia:JKIA, Nairobi','wilson:Wilson, Nairobi','moi:Moi, Mombasa','kisumu:Kisumu','other:Other']),
  pg_temp.q('vehicle_classes', 'Vehicle classes you offer', 'multi', 2,
    'Customers pick by passengers and luggage.',
    array['sedan:Sedan','suv:SUV','van:Van or minibus','executive:Executive']),
  pg_temp.q('flight_tracking', 'Do you track flight times?', 'single', 4,
    'Lets you wait for a delayed flight instead of marking a no-show.',
    array['yes:Yes, we track the flight','no:No, fixed pickup time']),
  pg_temp.q('included_wait', 'Free waiting time after landing', 'single', 4, null,
    array['30:30 minutes','60:60 minutes','90:90 minutes or more']),
  pg_temp.q('booking_notice', 'How much notice do you need?', 'single', 4, null,
    array['2h:2 hours','6h:6 hours','24h:24 hours'])
));

select pg_temp.add_questions('experiences', jsonb_build_array(
  pg_temp.q('booking_mode', 'How do guests book?', 'single', 4,
    'Dated events and classes sell tickets. Private events and custom shoots start with a quote.',
    array['ticketed:Tickets for dated sessions','quote_first:Quote first','both:Both']),
  pg_temp.q('capacity_control', 'How is capacity controlled?', 'single', 4,
    'We stop selling at capacity.',
    array['per_session:A fixed number of seats per session','per_day:A fixed number per day','ask_first:We confirm each booking']),
  pg_temp.q('booking_cutoff', 'Booking closes', 'single', 4, null,
    array['none:At the start','2h:2 hours before','24h:24 hours before','48h:48 hours before']),
  pg_temp.q('safety_controls', 'Safety measures in place', 'multi', 5,
    'Activities with physical risk get a closer review.',
    array['insurance:Insurance','first_aid:First aid on site','briefing:Safety briefing','age_limits:Age or fitness limits'])
));

select pg_temp.add_questions('travel_tours', jsonb_build_array(
  pg_temp.q('booking_mode', 'How do guests book?', 'single', 4, null,
    array['instant:Instant booking','quote_first:Quote first']),
  pg_temp.q('departures', 'When do trips run?', 'single', 4, null,
    array['fixed_dates:Fixed departure dates','on_request:On request']),
  pg_temp.q('payment_schedule', 'How do guests pay?', 'single', 4, null,
    array['full:Full payment upfront','deposit_balance:Deposit now, balance later']),
  pg_temp.q('min_travelers', 'Minimum travelers to run a trip', 'single', 4, null,
    array['1:No minimum','2:2','4:4','6:6 or more']),
  pg_temp.q('supplier_confirmation', 'Do suppliers confirm each booking?', 'single', 4,
    'Lodges, parks and guides that must confirm before you do.',
    array['yes:Yes','no:No, we confirm ourselves'])
));

select pg_temp.add_questions('fashion_apparel', jsonb_build_array(
  pg_temp.q('size_system', 'Sizing you use', 'multi', 2, null,
    array['alpha:S / M / L','uk:UK sizes','eu:EU sizes','us:US sizes','one_size:One size']),
  pg_temp.q('stock_tracking', 'How do you track stock?', 'single', 2, null,
    array['per_variant:Per size and colour','per_item:Per item']),
  pg_temp.q('returns_policy', 'Returns', 'single', 2, null,
    array['none:No returns','exchange:Exchange only','7d:Returns within 7 days','14d:Returns within 14 days'])
));

select pg_temp.add_questions('financial_services', jsonb_build_array(
  pg_temp.q('provider_role', 'What is your role?', 'single', 2,
    'Regulated activity stays off until the right authorization is checked.',
    array['licensed:Licensed provider','agent:Agent of a licensed provider','referral:Referral or information only']),
  pg_temp.q('regulators', 'Which regulators apply to you?', 'multi', 5,
    'Your answer routes the review. It is not proof of a licence.',
    array['cbk:CBK','ira:IRA','sasra:SASRA','cma:CMA','other:Other','none:None']),
  pg_temp.q('application_handoff', 'How do customers start?', 'single', 4,
    'We never collect bank credentials in the app.',
    array['appointment:Book a consultation','call_back:You call them back','your_site:Handed to your own secure site']),
  pg_temp.q('response_sla', 'How fast do you respond?', 'single', 4, null,
    array['1h:Within an hour','same_day:Same day','24h:Within a day'])
));

select pg_temp.add_questions('logistics_shipping', jsonb_build_array(
  pg_temp.q('operator_role', 'What is your role?', 'multi', 2,
    'Forwarding is different from clearing customs for a customer.',
    array['carrier:Carrier','forwarder:Freight forwarder','customs_agent:Customs agent','warehouse:Warehouse operator']),
  pg_temp.q('cargo_types', 'Cargo you take', 'multi', 2, null,
    array['general:General','perishable:Perishable','hazardous:Hazardous','oversized:Oversized','high_value:High value']),
  pg_temp.q('booking_mode', 'How do customers book?', 'single', 4, null,
    array['quote:Request a quote','instant:Instant booking','capacity_inquiry:Capacity inquiry']),
  pg_temp.q('transit_estimate', 'Typical transit time', 'single', 4,
    'Transit time, not a preparation time.',
    array['1d:Under a day','3d:1 to 3 days','7d:3 to 7 days','long:Over a week']),
  pg_temp.q('storage_type', 'Warehouse type', 'single', 5,
    'Bonded storage needs a separate licence check.',
    array['ordinary:Ordinary','bonded:Bonded','cold:Cold storage'],
    jsonb_build_object('answer','business_types','includes','warehousing'))
));

select pg_temp.add_questions('marketplace', jsonb_build_array(
  pg_temp.q('item_condition', 'Condition of what you sell', 'multi', 2, null,
    array['new:New','refurbished:Refurbished','used:Used','open_box:Open box']),
  pg_temp.q('delivery_size', 'How do items get to the customer?', 'single', 2,
    'Bulky goods are not a rider job.',
    array['rider:Rider-size items','bulky:Bulky, needs a vehicle or crew','pickup:Customer pickup only']),
  pg_temp.q('dispatch_mode', 'Do you dispatch from stock?', 'single', 4,
    'Lead time applies only to custom or pre-order goods.',
    array['stock:Yes, from stock','preorder:Pre-order or custom made']),
  pg_temp.q('install_service', 'Do you offer installation or assembly?', 'single', 4, null,
    array['yes:Yes','no:No'])
));

select pg_temp.add_questions('tech_electronics', jsonb_build_array(
  pg_temp.q('item_condition', 'Condition of what you sell', 'multi', 2, null,
    array['new:New','refurbished:Refurbished','used:Used']),
  pg_temp.q('serial_capture', 'Do you record serial numbers or IMEI?', 'single', 2, null,
    array['imei:IMEI','serial:Serial number','none:Not applicable']),
  pg_temp.q('warranty_by', 'Who covers warranty?', 'single', 2, null,
    array['shop:Your shop','brand:The brand','none:No warranty']),
  pg_temp.q('install_support', 'Do you offer setup or support visits?', 'single', 4,
    'Booked as separate appointments.',
    array['yes:Yes','no:No'])
));

select pg_temp.add_questions('health', jsonb_build_array(
  pg_temp.q('care_type', 'What kind of service is it?', 'single', 2,
    'Coaching is not clinical care and is reviewed differently.',
    array['clinical:Clinical care','non_clinical:Coaching or non-clinical']),
  pg_temp.q('appointment_format', 'How do patients attend?', 'multi', 4, null,
    array['in_person:In person','video:Video','phone:Phone','home_visit:Home visit']),
  pg_temp.q('session_length', 'Typical session length', 'single', 4, null,
    array['30:30 minutes','45:45 minutes','60:60 minutes','90:90 minutes or more']),
  pg_temp.q('practitioner_registered', 'Are your practitioners registered?', 'single', 5,
    'We check the registration. This answer only routes the review.',
    array['yes:Yes','some:Some of them','no:No'])
));

select pg_temp.add_questions('wellness', jsonb_build_array(
  pg_temp.q('booking_style', 'How do customers book?', 'multi', 4, null,
    array['appointment:Appointments','class:Classes','membership:Memberships']),
  pg_temp.q('session_length', 'Typical session length', 'single', 4, null,
    array['30:30 minutes','60:60 minutes','90:90 minutes or more']),
  pg_temp.q('class_capacity', 'People per class or session', 'single', 4, null,
    array['1:One to one','small:2 to 10','large:Over 10'])
));

select pg_temp.add_questions('vehicle_services', jsonb_build_array(
  pg_temp.q('service_location', 'Where do you do the work?', 'multi', 2, null,
    array['workshop:At your workshop','mobile:We come to the customer','roadside:Roadside assistance']),
  pg_temp.q('job_duration', 'Typical job length', 'single', 4,
    'Appointment length, not a preparation time.',
    array['30:Under 30 minutes','60:About an hour','half_day:Half a day','full_day:A full day']),
  pg_temp.q('extra_work_approval', 'Do you ask before doing extra work?', 'single', 4, null,
    array['always:Always','over_cost:Only above an agreed cost']),
  pg_temp.q('waste_handling', 'Do you handle used oil, tyres or batteries?', 'single', 5,
    'Regulated waste needs separate evidence.',
    array['yes:Yes','no:No'])
));

select pg_temp.add_questions('concierge_services', jsonb_build_array(
  pg_temp.q('request_mode', 'How do you price a request?', 'single', 2, null,
    array['quote:Quote first','fixed_fee:Fixed fee','appointment:Booked appointment']),
  pg_temp.q('spend_cap', 'Do you confirm a spend cap before buying for a customer?', 'single', 4,
    'Required for shopping assistance. Receipts are reconciled afterwards.',
    array['always:Always','no:No'],
    jsonb_build_object('answer','business_types','includes','shopping_assistance')),
  pg_temp.q('response_sla', 'How fast do you respond to a request?', 'single', 4, null,
    array['1h:Within an hour','same_day:Same day','24h:Within a day'])
));
