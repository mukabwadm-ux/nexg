import type { MerchantSubcategory } from '@nexg/contracts';

import type { Question, QuestionOption } from './types';

const option = (value: string, label: string): QuestionOption => ({ value, label });
const yesNo = [option('yes', 'Yes'), option('no', 'No')];

const booleanFields = new Set([
  'accommodation_included',
  'appointment_booking',
  'authenticity_guarantee',
  'available_24hr',
  'booking_required',
  'catering_available',
  'chauffeur_uniform',
  'corporate_billing',
  'corporate_clients',
  'couples_packages',
  'custom_orders',
  'custom_tailoring',
  'dedicated_account_mgr',
  'dermatologist_backed',
  'eco_products',
  'emergency_callout',
  'equipment_provided',
  'event_planning_offered',
  'flight_included',
  'flight_tracking',
  'gift_packaging',
  'gift_wrapping',
  'group_sessions',
  'guide_included',
  'has_physical_store',
  'home_sample_collection',
  'home_service',
  'home_visits',
  'installation_service',
  'insurance_accepted',
  'insurance_included',
  'live_seafood',
  'loyalty_program',
  'meet_greet_signage',
  'membership_available',
  'mobile_inspection',
  'mobile_service',
  'on_site_processing',
  'operations_24hr',
  'personal_training_available',
  'pickup_available',
  'pre_owned_games',
  'private_vehicle',
  'products_for_sale',
  'recurring_sessions',
  'recurring_sub',
  'report_provided',
  'same_day_delivery',
  'school_uniforms',
  'signature_required',
  'style_consultation',
  'subscription_boxes',
  'subscription_plans',
  'trade_in_program',
  'travel_insurance_assist',
  'venue_sourcing',
  'vip_packages',
  'visa_assistance',
  'walk_in_available',
  'warranty_offered',
  'with_driver',
  'zero_waste_packaging',
]);

const textFields = new Set([
  'battery_brands_text',
  'brands_stocked_text',
  'coverage_area_text',
  'deposit_policy_text',
  'destinations_text',
  'license_number',
  'operating_hours_text',
  'product_description',
  'regulatory_license',
  'retainer_ksh',
  'tire_brands_text',
  'vip_services_text',
]);

const singleChoiceFields: Record<string, QuestionOption[]> = {
  age_gate_method: [
    option('checkout', 'Age confirmation at checkout'),
    option('delivery_id', 'Rider checks ID at handover'),
    option('both', 'Both checkout confirmation and ID check'),
  ],
  age_requirement: [
    option('18', '18+'),
    option('21', '21+'),
    option('other', 'Different minimum age'),
  ],
  advance_booking_hrs: [
    option('same_day', 'Same-day bookings'),
    option('2_24_hours', '2-24 hours ahead'),
    option('1_3_days', '1-3 days ahead'),
    option('4_plus_days', '4 or more days ahead'),
  ],
  advance_booking_days: [
    option('same_day', 'Same day'),
    option('1_2_days', '1-2 days ahead'),
    option('3_7_days', '3-7 days ahead'),
    option('8_plus_days', 'More than a week ahead'),
  ],
  advance_order_required: [
    option('no', 'No advance order needed'),
    option('same_day', 'Order earlier the same day'),
    option('1_day', 'At least one day ahead'),
    option('2_plus_days', 'Two or more days ahead'),
  ],
  avg_session_duration: [
    option('under_30', 'Under 30 minutes'),
    option('30_60', '30-60 minutes'),
    option('1_2_hours', '1-2 hours'),
    option('over_2_hours', 'More than 2 hours'),
  ],
  avg_attendees: [
    option('under_50', 'Under 50 people'),
    option('50_200', '50-200 people'),
    option('201_500', '201-500 people'),
    option('over_500', 'More than 500 people'),
  ],
  billing_cycle: [
    option('per_day', 'Per day'),
    option('per_week', 'Per week'),
    option('per_month', 'Per month'),
    option('per_booking', 'Per booking'),
  ],
  brand_tier: [
    option('local', 'Local and independent brands'),
    option('mainstream', 'Mainstream brands'),
    option('premium', 'Premium brands'),
    option('mixed', 'A mix of brands'),
  ],
  capacity_range: [
    option('under_20', 'Under 20 people'),
    option('20_50', '20-50 people'),
    option('51_100', '51-100 people'),
    option('101_300', '101-300 people'),
    option('over_300', 'More than 300 people'),
  ],
  deposit_policy_text: [
    option('none', 'No deposit'),
    option('refundable', 'Refundable security deposit'),
    option('partial', 'Partial or booking deposit'),
    option('full', 'Full prepayment'),
  ],
  digital_platform: [
    option('website', 'Website'),
    option('mobile_app', 'Mobile app'),
    option('web_and_app', 'Website and mobile app'),
    option('none', 'No digital platform yet'),
  ],
  duration_min: [
    option('under_30', 'Under 30 minutes'),
    option('30_60', '30-60 minutes'),
    option('1_2_hours', '1-2 hours'),
    option('over_2_hours', 'More than 2 hours'),
  ],
  duration_options: [
    option('under_2_hours', 'Under 2 hours'),
    option('half_day', 'Half day'),
    option('full_day', 'Full day'),
    option('multi_day', 'Multiple days'),
  ],
  fuel_policy: [
    option('full_to_full', 'Return with the same fuel level'),
    option('included', 'Fuel included'),
    option('customer_pays', 'Customer pays for fuel used'),
    option('varies', 'Depends on the rental'),
  ],
  fleet_size: [
    option('1_2', '1-2 vehicles'),
    option('3_5', '3-5 vehicles'),
    option('6_10', '6-10 vehicles'),
    option('11_20', '11-20 vehicles'),
    option('over_20', 'More than 20 vehicles'),
  ],
  fragile_handling: [
    option('standard', 'Standard handling'),
    option('careful', 'Protective packaging'),
    option('specialist', 'Specialist handling and delivery'),
  ],
  kids_age_range: [
    option('0_2', 'Baby and toddler (0-2)'),
    option('3_5', 'Early childhood (3-5)'),
    option('6_12', 'Children (6-12)'),
    option('13_17', 'Teens (13-17)'),
  ],
  max_group_size: [
    option('1_2', '1-2 guests'),
    option('3_5', '3-5 guests'),
    option('6_10', '6-10 guests'),
    option('11_20', '11-20 guests'),
    option('over_20', 'More than 20 guests'),
  ],
  max_headcount: [
    option('under_10', 'Under 10 people'),
    option('10_25', '10-25 people'),
    option('26_50', '26-50 people'),
    option('51_100', '51-100 people'),
    option('over_100', 'More than 100 people'),
  ],
  meal_plan: [
    option('none', 'No meals'),
    option('breakfast', 'Breakfast'),
    option('half_board', 'Breakfast and one other meal'),
    option('full_board', 'All meals'),
  ],
  min_headcount: [
    option('1_5', '1-5 people'),
    option('6_10', '6-10 people'),
    option('11_20', '11-20 people'),
    option('over_20', 'More than 20 people'),
  ],
  min_hours_session: [
    option('1', '1 hour'),
    option('2', '2 hours'),
    option('3_4', '3-4 hours'),
    option('5_plus', '5 or more hours'),
  ],
  min_nights: [
    option('1', '1 night'),
    option('2_3', '2-3 nights'),
    option('4_6', '4-6 nights'),
    option('7_plus', '7 or more nights'),
  ],
  min_order: [
    option('none', 'No minimum'),
    option('500', 'KES 500'),
    option('1000', 'KES 1,000'),
    option('2000', 'KES 2,000'),
    option('5000', 'KES 5,000 or more'),
  ],
  min_rental_duration: [
    option('hourly', 'By the hour'),
    option('daily', 'By the day'),
    option('weekly', 'By the week'),
    option('monthly', 'By the month'),
  ],
  new_or_refurbished: [
    option('new', 'New only'),
    option('refurbished', 'Refurbished only'),
    option('both', 'New and refurbished'),
  ],
  new_or_used: [
    option('new', 'New only'),
    option('used', 'Pre-owned only'),
    option('both', 'New and pre-owned'),
  ],
  packaging_fashion: [
    option('standard', 'Standard packaging'),
    option('gift', 'Gift-ready packaging'),
    option('branded', 'Branded packaging'),
    option('eco', 'Eco-friendly packaging'),
  ],
  packaging_style: [
    option('discreet', 'Plain, discreet packaging'),
    option('branded', 'Branded packaging'),
    option('both', 'Discreet and branded options'),
  ],
  physical_locations_count: [
    option('1', 'One location'),
    option('2_5', '2-5 locations'),
    option('6_10', '6-10 locations'),
    option('over_10', 'More than 10 locations'),
  ],
  return_policy: [
    option('no_returns', 'No returns'),
    option('exchange_only', 'Exchange only'),
    option('7_days', 'Returns within 7 days'),
    option('14_days', 'Returns within 14 days'),
    option('varies', 'Depends on the item'),
  ],
  retainer_model: [
    option('one_off', 'One-off requests'),
    option('monthly', 'Monthly retainer'),
    option('both', 'One-off and retainer options'),
  ],
  response_time_hrs: [
    option('under_1_hour', 'Under 1 hour'),
    option('1_4_hours', '1-4 hours'),
    option('same_day', 'Same day'),
    option('next_business_day', 'Next business day'),
  ],
  response_time_min: [
    option('under_30', 'Under 30 minutes'),
    option('30_60', '30-60 minutes'),
    option('1_3_hours', '1-3 hours'),
    option('over_3_hours', 'More than 3 hours'),
  ],
  results_turnaround_hrs: [
    option('under_6_hours', 'Under 6 hours'),
    option('same_day', 'Same day'),
    option('next_day', 'Next day'),
    option('2_plus_days', '2 or more days'),
  ],
  session_duration_text: [
    option('under_1_hour', 'Under 1 hour'),
    option('1_2_hours', '1-2 hours'),
    option('half_day', 'Half day'),
    option('full_day', 'Full day'),
    option('varies', 'Varies by session'),
  ],
  session_durations: [
    option('under_30', 'Under 30 minutes'),
    option('30_60', '30-60 minutes'),
    option('1_2_hours', '1-2 hours'),
    option('over_2_hours', 'More than 2 hours'),
  ],
  session_format: [
    option('in_person', 'In person'),
    option('online', 'Online'),
    option('both', 'In person and online'),
  ],
  session_location: [
    option('venue', 'At our venue'),
    option('client_location', 'At the client location'),
    option('online', 'Online'),
    option('flexible', 'Flexible'),
  ],
  shoe_size_system: [
    option('uk', 'UK sizes'),
    option('eu', 'EU sizes'),
    option('us', 'US sizes'),
    option('multiple', 'More than one size system'),
  ],
  ticket_delivery_method: [
    option('mobile', 'Mobile or e-ticket'),
    option('email', 'Email'),
    option('pickup', 'Collection at the venue'),
    option('multiple', 'More than one option'),
  ],
  waiting_time_min: [
    option('15', 'Up to 15 minutes'),
    option('30', 'Up to 30 minutes'),
    option('60', 'Up to 1 hour'),
    option('over_60', 'More than 1 hour'),
  ],
  warranty_months: [
    option('none', 'No warranty'),
    option('3', 'Up to 3 months'),
    option('6', 'Up to 6 months'),
    option('12', '12 months'),
    option('over_12', 'More than 12 months'),
  ],
};

const multiChoiceFields: Record<string, QuestionOption[]> = {
  biz_services_offered: [
    option('registration', 'Business registration'),
    option('tax', 'Tax and compliance support'),
    option('accounting', 'Accounting'),
    option('legal', 'Legal services'),
    option('consulting', 'Business consulting'),
  ],
  computer_brands: [
    option('apple', 'Apple'),
    option('dell', 'Dell'),
    option('hp', 'HP'),
    option('lenovo', 'Lenovo'),
    option('other', 'Other brands'),
  ],
  assistance_services: [
    option('breakdown', 'Breakdown recovery'),
    option('jump_start', 'Jump start'),
    option('towing', 'Towing'),
    option('lockout', 'Lockout support'),
    option('fuel_delivery', 'Emergency fuel'),
  ],
  av_equipment: [
    option('sound', 'Sound system'),
    option('projector', 'Projector and screen'),
    option('microphones', 'Microphones'),
    option('lighting', 'Lighting'),
    option('video', 'Video equipment'),
  ],
  bike_types: [
    option('motorcycle', 'Motorcycles'),
    option('scooter', 'Scooters'),
    option('bicycle', 'Bicycles'),
    option('electric', 'Electric bikes'),
  ],
  book_genres: [
    option('fiction', 'Fiction'),
    option('nonfiction', 'Non-fiction'),
    option('children', 'Children and education'),
    option('business', 'Business'),
    option('academic', 'Academic'),
    option('other', 'Other genres'),
  ],
  clinic_specializations: [
    option('general', 'General practice'),
    option('dental', 'Dental'),
    option('paediatrics', 'Paediatrics'),
    option('maternal', 'Maternal health'),
    option('specialist', 'Specialist care'),
  ],
  coaching_areas: [
    option('fitness', 'Fitness'),
    option('nutrition', 'Nutrition'),
    option('mental_wellbeing', 'Mental wellbeing'),
    option('career', 'Career and life coaching'),
    option('other', 'Other coaching'),
  ],
  console_types: [
    option('playstation', 'PlayStation'),
    option('xbox', 'Xbox'),
    option('nintendo', 'Nintendo'),
    option('pc', 'PC gaming'),
  ],
  currencies_traded: [
    option('kes_usd', 'KES and USD'),
    option('kes_eur', 'KES and EUR'),
    option('kes_gbp', 'KES and GBP'),
    option('east_african', 'East African currencies'),
    option('other', 'Other currencies'),
  ],
  destinations_coverage: [
    option('nairobi', 'Nairobi'),
    option('kenya', 'Across Kenya'),
    option('east_africa', 'East Africa'),
    option('international', 'International'),
  ],
  equipment_provided: [
    option('all', 'All required equipment'),
    option('some', 'Some equipment'),
    option('no', 'Guests bring their own'),
  ],
  fin_services_offered_bank: [
    option('accounts', 'Accounts'),
    option('loans', 'Loans'),
    option('savings', 'Savings'),
    option('payments', 'Payments'),
    option('advisory', 'Financial advice'),
  ],
  gaming_accessories: [
    option('controllers', 'Controllers'),
    option('headsets', 'Headsets'),
    option('keyboards', 'Keyboards and mice'),
    option('storage', 'Storage and charging'),
  ],
  gym_facilities: [
    option('weights', 'Weights'),
    option('cardio', 'Cardio equipment'),
    option('classes', 'Group classes'),
    option('showers', 'Changing rooms and showers'),
    option('pool', 'Pool'),
  ],
  insurance_items: [
    option('household', 'Household belongings'),
    option('electronics', 'Electronics'),
    option('vehicles', 'Vehicles'),
    option('business', 'Business equipment'),
    option('other', 'Other items'),
  ],
  insurance_types: [
    option('health', 'Health'),
    option('motor', 'Motor'),
    option('life', 'Life'),
    option('property', 'Property'),
    option('business', 'Business'),
    option('travel', 'Travel'),
  ],
  inspection_types: [
    option('pre_purchase', 'Pre-purchase'),
    option('roadworthy', 'Roadworthiness'),
    option('insurance', 'Insurance'),
    option('diagnostic', 'Diagnostic'),
    option('routine', 'Routine inspection'),
  ],
  lab_test_types: [
    option('blood', 'Blood tests'),
    option('imaging', 'Imaging'),
    option('wellness', 'Wellness screening'),
    option('diagnostic', 'Diagnostic tests'),
  ],
  massage_types: [
    option('swedish', 'Swedish'),
    option('deep_tissue', 'Deep tissue'),
    option('sports', 'Sports'),
    option('aromatherapy', 'Aromatherapy'),
    option('other', 'Other massage'),
  ],
  membership_types: [
    option('monthly', 'Monthly'),
    option('quarterly', 'Quarterly'),
    option('annual', 'Annual'),
    option('class_pack', 'Class or session packs'),
  ],
  parks_covered: [
    option('maasai_mara', 'Maasai Mara'),
    option('amboseli', 'Amboseli'),
    option('tsavo', 'Tsavo'),
    option('lake_nakuru', 'Lake Nakuru'),
    option('other_kenya', 'Other parks in Kenya'),
  ],
  payment_channels: [
    option('mpesa', 'M-Pesa'),
    option('bank_transfer', 'Bank transfer'),
    option('cards', 'Cards'),
    option('online', 'Online payments'),
  ],
  phone_brands: [
    option('samsung', 'Samsung'),
    option('apple', 'Apple'),
    option('tecno_infinix', 'Tecno and Infinix'),
    option('xiaomi', 'Xiaomi'),
    option('multiple', 'Other brands'),
  ],
  package_types: [
    option('day_trip', 'Day trips'),
    option('weekend', 'Weekend trips'),
    option('multi_day', 'Multi-day trips'),
    option('custom', 'Custom packages'),
  ],
  reservation_venue_types: [
    option('restaurants', 'Restaurants'),
    option('hotels', 'Hotels'),
    option('events', 'Events and venues'),
    option('transport', 'Transport'),
    option('other', 'Other reservations'),
  ],
  remittance_corridors: [
    option('kenya_east_africa', 'Kenya and East Africa'),
    option('kenya_europe', 'Kenya and Europe'),
    option('kenya_north_america', 'Kenya and North America'),
    option('global', 'Other international corridors'),
  ],
  repair_services: [
    option('screen', 'Screen replacement'),
    option('battery', 'Battery replacement'),
    option('software', 'Software support'),
    option('hardware', 'Hardware repairs'),
    option('diagnostics', 'Diagnostics'),
  ],
  sacco_services_offered: [
    option('savings', 'Savings'),
    option('loans', 'Loans'),
    option('payments', 'Payments'),
    option('insurance', 'Insurance'),
    option('member_services', 'Member services'),
  ],
  size_range_adults: [
    option('xs_s', 'XS-S'),
    option('m_l', 'M-L'),
    option('xl_xxl', 'XL-XXL'),
    option('extended', 'Extended sizes'),
  ],
  spa_services: [
    option('facials', 'Facials'),
    option('body_treatments', 'Body treatments'),
    option('massage', 'Massage'),
    option('nails', 'Nails'),
    option('other', 'Other spa services'),
  ],
  telecom_networks: [
    option('safaricom', 'Safaricom'),
    option('airtel', 'Airtel'),
    option('telkom', 'Telkom'),
    option('multiple', 'Multiple networks'),
  ],
  tele_platforms: [
    option('phone', 'Phone or video calls'),
    option('website', 'Website'),
    option('mobile_app', 'Mobile app'),
    option('messaging', 'Secure messaging'),
  ],
  therapy_types: [
    option('individual', 'Individual therapy'),
    option('couples', 'Couples therapy'),
    option('family', 'Family therapy'),
    option('group', 'Group therapy'),
  ],
  telecom_services_offered: [
    option('airtime', 'Airtime'),
    option('data', 'Data bundles'),
    option('devices', 'Devices'),
    option('accessories', 'Accessories'),
    option('sim_services', 'SIM services'),
  ],
  tour_languages: [
    option('english', 'English'),
    option('swahili', 'Swahili'),
    option('french', 'French'),
    option('other', 'Other languages'),
  ],
  tour_modes: [
    option('walking', 'Walking'),
    option('vehicle', 'Vehicle'),
    option('cycling', 'Cycling'),
    option('boat', 'Boat'),
    option('flight', 'Flight'),
  ],
  training_specializations: [
    option('strength', 'Strength training'),
    option('cardio', 'Cardio'),
    option('weight_loss', 'Weight management'),
    option('rehabilitation', 'Rehabilitation'),
    option('other', 'Other specializations'),
  ],
  vehicle_types_rental: [
    option('car', 'Cars'),
    option('motorbike', 'Motorbikes'),
    option('van', 'Vans'),
    option('suv', 'SUVs and 4x4s'),
    option('tuktuk', 'Tuk-tuks'),
  ],
  vape_device_types: [
    option('disposable', 'Disposable devices'),
    option('refillable', 'Refillable devices'),
    option('pod', 'Pod systems'),
    option('mods', 'Mods and advanced devices'),
  ],
  vehicle_types_transfer: [
    option('sedan', 'Sedans'),
    option('suv', 'SUVs and 4x4s'),
    option('van', 'Vans'),
    option('minibus', 'Minibuses'),
    option('executive', 'Executive vehicles'),
  ],
  wash_types: [
    option('exterior', 'Exterior wash'),
    option('interior', 'Interior cleaning'),
    option('full_detail', 'Full detailing'),
    option('engine', 'Engine cleaning'),
    option('motorcycle', 'Motorcycle wash'),
  ],
};

const labels: Record<string, string> = {
  advance_booking_hrs: 'How far ahead should customers book?',
  advance_booking_days: 'How far ahead should customers book?',
  available_24hr: 'Are you available 24 hours a day?',
  brands_stocked_text: 'Which brands do you stock?',
  corporate_billing: 'Do you offer corporate billing?',
  fleet_size: 'How many vehicles are in your fleet?',
  has_physical_store: 'Do you have a physical store?',
  home_service: 'Do you visit customers at home?',
  license_number: 'What licence or registration should we verify?',
  min_order: 'What is your minimum order?',
  operating_hours_text: 'What are your operating hours?',
  product_description: 'What should customers know about your products?',
  retainer_ksh: 'What retainer amount do you offer?',
  signature_required: 'Do you require a signature at handover?',
  vehicle_types_rental: 'Which vehicles can customers rent?',
  vehicle_types_transfer: 'Which vehicles do you use for transfers?',
};

const knownFields = new Set([
  ...booleanFields,
  ...textFields,
  ...Object.keys(singleChoiceFields),
  ...Object.keys(multiChoiceFields),
]);

export function questionsForSubcategory(
  subcategory: Pick<MerchantSubcategory, 'id' | 'name'> & { fields?: string[] },
): Question[] {
  return (subcategory.fields ?? []).map((key) => {
    const label = labels[key] ?? humanizeField(key);
    if (booleanFields.has(key)) {
      return { key, label: `${label}?`, type: 'single', options: yesNo };
    }
    if (textFields.has(key)) {
      return {
        key,
        label,
        type: 'text',
        hint: 'Add the exact detail customers or our verification team need.',
      };
    }

    const options = singleChoiceFields[key] ?? multiChoiceFields[key];
    if (!options) {
      throw new Error(`No onboarding choices are configured for "${key}".`);
    }

    return {
      key,
      label: labels[key] ?? `${label}?`,
      type: multiChoiceFields[key] ? 'multi' : 'single',
      options,
    };
  });
}

export function isSupportedSubcategoryField(key: string): boolean {
  return knownFields.has(key);
}

function humanizeField(field: string): string {
  return field
    .replace(/_(text|hrs|min|kes|sqm|sqft)$/g, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
