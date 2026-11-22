-- Merchant onboarding follows the owner's data-collection template
-- (Nexgenius_Merchant_Onboarding_Template.xlsx: Common Fields plus the Part F
-- category addenda F2.1-F2.6 and F3.1-F3.11).
--
-- What this adds:
--   * merchant_onboarding_field: the template as data. One row per field, with
--     the categories it applies to, its type and rule (required, optional, or
--     required only when a yes/no question above it is answered yes).
--   * merchant_onboarding_answer: what each merchant answered, one row each.
--   * rpc_merchant_onboarding_read / _save for the merchant form and the staff
--     review, and a submit check: an application cannot be submitted while a
--     required field for its category is missing (owner, 18 Nov 2026).
--   * The template's documents: the owner ID copy and KRA PIN certificate are
--     required again, a business registration certificate is added, the county
--     business permit is required only where an addendum asks for it, and each
--     category's own uploads are added.
--
-- Owner decisions (18 Nov 2026): Financial Services (F2.7) is skipped because
-- the category is retired; Vehicle Services (F2.5) applies to vehicle_rentals;
-- categories with no template tab get the common fields only; payout stays
-- optional (bank branch is an optional field here).
--
-- Backward compatible: the site shows the new section only once these
-- functions exist, and nothing here changes a column an older deploy reads.

-- ------------------------------------------------------------------ catalogue

create table public.merchant_onboarding_field (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  section text not null check (section in ('business', 'owner', 'payout', 'policies', 'compliance')),
  -- Category ids it applies to; null means every category.
  categories text[],
  label text not null check (length(trim(label)) between 2 and 200),
  hint text,
  type text not null check (type in ('text', 'long_text', 'date', 'yes_no', 'select', 'rows')),
  -- select: [{value, label}]
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  -- rows: [{key, label, type: text|date, pattern?, future_date?, placeholder?}]
  columns jsonb not null default '[]'::jsonb check (jsonb_typeof(columns) = 'array'),
  -- Case-insensitive regular expression a text answer must match.
  pattern text,
  placeholder text,
  required text not null check (required in ('yes', 'no', 'conditional')),
  -- {"field": key, "equals": "yes"} for a conditional field.
  required_when jsonb,
  -- A confirmation: complete only when answered Yes.
  must_be_yes boolean not null default false,
  -- An expiry date: refused once it has passed.
  future_date boolean not null default false,
  -- A yes/no question that, answered yes, makes this document kind required.
  requires_doc text,
  source text not null,
  sort integer not null,
  check ((required = 'conditional') = (required_when is not null)),
  check (type <> 'select' or jsonb_array_length(options) > 0),
  check (type <> 'rows' or jsonb_array_length(columns) > 0),
  check (requires_doc is null or type = 'yes_no')
);

comment on table public.merchant_onboarding_field is
  'The owner''s merchant onboarding template as data: what every merchant, and each category, is asked during onboarding. Editing a row changes what applicants are asked.';

create table public.merchant_onboarding_answer (
  merchant_id uuid primary key references public.merchant (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.merchant_onboarding_answer is
  'A merchant''s answers to merchant_onboarding_field, keyed by field key. Read and written through rpc_merchant_onboarding_read / _save only.';

alter table public.merchant_onboarding_field enable row level security;
alter table public.merchant_onboarding_answer enable row level security;
revoke all on public.merchant_onboarding_field, public.merchant_onboarding_answer
  from public, anon, authenticated;

insert into public.merchant_onboarding_field
  (key, section, categories, label, hint, type, options, columns, pattern, placeholder,
   required, required_when, must_be_yes, future_date, requires_doc, source, sort)
select x.key, x.section, x.categories, x.label, x.hint, x.type,
       coalesce(x.options, '[]'::jsonb), coalesce(x.columns, '[]'::jsonb), x.pattern,
       x.placeholder, x.required, x.required_when, coalesce(x.must_be_yes, false),
       coalesce(x.future_date, false), x.requires_doc, x.source, x.sort
from jsonb_to_recordset($fields$[
  {"key":"business_type","section":"business","label":"Business type","type":"select","required":"yes","source":"General","sort":10,
   "options":[{"value":"sole_proprietor","label":"Sole proprietor"},{"value":"partnership","label":"Partnership"},{"value":"limited_company","label":"Limited company"}]},
  {"key":"county","section":"business","label":"County of operation","hint":"The Kenyan county where you mainly trade.","type":"select","required":"yes","source":"General","sort":20,
   "options":[{"value":"pending","label":"pending"}]},
  {"key":"map_pin","section":"business","label":"Google Maps pin","hint":"Optional. Latitude, longitude, e.g. -1.2864, 36.8172. Helps riders find you.","type":"text","required":"no","source":"General","sort":30,
   "pattern":"^-?[0-9]{1,2}(\\.[0-9]+)?, *-?[0-9]{1,3}(\\.[0-9]+)?$","placeholder":"-1.2864, 36.8172"},
  {"key":"owner_id_number","section":"owner","label":"Owner or director national ID or passport number","hint":"For KYC. You upload a copy under Documents after you apply.","type":"text","required":"yes","source":"General","sort":40,
   "pattern":"^[A-Z0-9]{6,12}$","placeholder":"12345678"},
  {"key":"bank_branch","section":"payout","label":"Bank branch","hint":"Optional. Only if NexG pays you into a bank account.","type":"text","required":"no","source":"General","sort":50,"placeholder":"Moi Avenue"},
  {"key":"policies_acknowledged","section":"policies","label":"I have read and accept NexG's refund, cancellation and complaints policy","hint":"Merchant Agreement, Schedule 1.8.","type":"yes_no","required":"yes","must_be_yes":true,"source":"Schedule 1.8","sort":60},

  {"key":"at_vehicles","section":"compliance","categories":["airport_transfers"],"label":"Vehicles","hint":"One row per vehicle; the details must match your listings. Insurance must cover third-party and passenger liability.","type":"rows","required":"yes","source":"Addendum F2.1","sort":100,
   "columns":[
     {"key":"registration","label":"Registration number","type":"text","pattern":"^[A-Z0-9 ]{4,12}$","placeholder":"KDA 123A"},
     {"key":"make_model_seats","label":"Make, model and seats","type":"text","placeholder":"Toyota Noah, 7 seats"},
     {"key":"psv_licence_number","label":"PSV licence number (NTSA)","type":"text","pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
     {"key":"psv_licence_expiry","label":"PSV licence expiry","type":"date","future_date":true},
     {"key":"insurance_policy_number","label":"Motor insurance policy number","type":"text","pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
     {"key":"insurance_expiry","label":"Motor insurance expiry","type":"date","future_date":true},
     {"key":"roadworthiness_number","label":"NTSA roadworthiness certificate number","type":"text","pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
     {"key":"roadworthiness_expiry","label":"Roadworthiness certificate expiry","type":"date","future_date":true}]},
  {"key":"at_drivers","section":"compliance","categories":["airport_transfers"],"label":"Drivers","hint":"One row per assigned driver.","type":"rows","required":"yes","source":"Addendum F2.1","sort":110,
   "columns":[
     {"key":"full_name","label":"Full name","type":"text"},
     {"key":"licence","label":"Driving licence number and class","type":"text","placeholder":"DL1234567 BCE"},
     {"key":"psv_badge","label":"PSV badge number","type":"text","pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"}]},

  {"key":"liquor_licence_number","section":"compliance","categories":["alcohol_beverages"],"label":"County liquor licence number","hint":"Issued by the county alcoholic drinks regulation committee.","type":"text","required":"yes","source":"Addendum F2.2","sort":200,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"liquor_issuing_authority","section":"compliance","categories":["alcohol_beverages"],"label":"Issuing county authority","type":"text","required":"yes","source":"Addendum F2.2","sort":201,"placeholder":"Nairobi City County"},
  {"key":"liquor_licence_expiry","section":"compliance","categories":["alcohol_beverages"],"label":"Liquor licence expiry date","type":"date","required":"yes","future_date":true,"source":"Addendum F2.2","sort":202},
  {"key":"alcohol_manufacturer","section":"compliance","categories":["alcohol_beverages"],"label":"Do you manufacture or repackage alcohol?","type":"yes_no","required":"yes","source":"Addendum F2.2","sort":203},
  {"key":"excise_licence_number","section":"compliance","categories":["alcohol_beverages"],"label":"KRA excise licence number","type":"text","required":"conditional","required_when":{"field":"alcohol_manufacturer","equals":"yes"},"source":"Addendum F2.2","sort":204,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"delivery_hours","section":"compliance","categories":["alcohol_beverages"],"label":"Permitted delivery hours","hint":"As your county's law allows.","type":"text","required":"yes","source":"Addendum F2.2","sort":205,
   "pattern":"^([01][0-9]|2[0-3]):[0-5][0-9] *- *([01][0-9]|2[0-4]):[0-5][0-9]$","placeholder":"09:00-22:00"},
  {"key":"age_verification_confirmed","section":"compliance","categories":["alcohol_beverages"],"label":"We check a government ID (18+) at checkout and again at delivery","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.2","sort":206},

  {"key":"ppb_premises_licence_number","section":"compliance","categories":["pharmacy"],"label":"PPB retail pharmacy premises licence number","hint":"Pharmacy and Poisons Board.","type":"text","required":"yes","source":"Addendum F2.3","sort":300,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"ppb_premises_licence_expiry","section":"compliance","categories":["pharmacy"],"label":"PPB premises licence expiry date","type":"date","required":"yes","future_date":true,"source":"Addendum F2.3","sort":301},
  {"key":"pharmacist_name","section":"compliance","categories":["pharmacy"],"label":"Registered pharmacist or pharm-technologist","hint":"The person responsible for dispensing.","type":"text","required":"yes","source":"Addendum F2.3","sort":302},
  {"key":"pharmacist_ppb_number","section":"compliance","categories":["pharmacy"],"label":"Their PPB registration number","type":"text","required":"yes","source":"Addendum F2.3","sort":303,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"cold_chain","section":"compliance","categories":["pharmacy"],"label":"Can you handle cold-chain medicines such as insulin and vaccines?","type":"yes_no","required":"yes","source":"Addendum F2.3","sort":304},
  {"key":"pom_workflow_confirmed","section":"compliance","categories":["pharmacy"],"label":"A registered pharmacist sees the prescription before any prescription-only medicine is dispensed","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.3","sort":305},
  {"key":"pharmacy_indemnity_policy","section":"compliance","categories":["pharmacy"],"label":"Professional indemnity insurance policy number","hint":"Cover for dispensing.","type":"text","required":"yes","source":"Addendum F2.3","sort":306,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},

  {"key":"tra_licence_number","section":"compliance","categories":["travel_tours"],"label":"TRA tour operator or travel agent licence number","hint":"Tourism Regulatory Authority.","type":"text","required":"yes","source":"Addendum F2.4","sort":400,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"tra_licence_expiry","section":"compliance","categories":["travel_tours"],"label":"TRA licence expiry date","type":"date","required":"yes","future_date":true,"source":"Addendum F2.4","sort":401},
  {"key":"tra_bond_required","section":"compliance","categories":["travel_tours"],"label":"Does TRA require you to hold a bond or financial security for customer deposits?","type":"yes_no","required":"yes","source":"Addendum F2.4","sort":402},
  {"key":"tra_bond_reference","section":"compliance","categories":["travel_tours"],"label":"Bond or financial security reference","type":"text","required":"conditional","required_when":{"field":"tra_bond_required","equals":"yes"},"source":"Addendum F2.4","sort":403},
  {"key":"travel_public_liability_policy","section":"compliance","categories":["travel_tours"],"label":"Public liability insurance policy number","type":"text","required":"yes","source":"Addendum F2.4","sort":404,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},

  {"key":"vs_county_regulated","section":"compliance","categories":["vehicle_rentals"],"label":"Does your county regulate your premises or work (for example a garage operating permit)?","type":"yes_no","required":"yes","requires_doc":"business_permit","source":"Addendum F2.5","sort":500},
  {"key":"vs_county_permit_number","section":"compliance","categories":["vehicle_rentals"],"label":"County garage operating or single business permit number","type":"text","required":"conditional","required_when":{"field":"vs_county_regulated","equals":"yes"},"source":"Addendum F2.5","sort":501,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"vs_inspection_work","section":"compliance","categories":["vehicle_rentals"],"label":"Do you do vehicle inspection or emissions work?","type":"yes_no","required":"yes","source":"Addendum F2.5","sort":502},
  {"key":"vs_ntsa_authorisation","section":"compliance","categories":["vehicle_rentals"],"label":"NTSA authorisation number","type":"text","required":"conditional","required_when":{"field":"vs_inspection_work","equals":"yes"},"source":"Addendum F2.5","sort":503,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"vs_handover_record_confirmed","section":"compliance","categories":["vehicle_rentals"],"label":"Customers sign a job or handover record when we take and return a vehicle","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.5","sort":504},
  {"key":"vs_parts_disclosure_confirmed","section":"compliance","categories":["vehicle_rentals"],"label":"We tell customers whether parts are genuine, OEM or used","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.5","sort":505},
  {"key":"vs_custody_policy","section":"compliance","categories":["vehicle_rentals"],"label":"Garage-keeper's liability or goods-in-custody insurance policy number","type":"text","required":"yes","source":"Addendum F2.5","sort":506,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},

  {"key":"ao_kfcb_confirmed","section":"compliance","categories":["adults_only"],"label":"Our content complies with Kenya Film Classification Board rules","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.6","sort":600},
  {"key":"ao_lawful_warranty","section":"compliance","categories":["adults_only"],"label":"I warrant that everything we sell or show is lawful in Kenya","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.6","sort":601},
  {"key":"ao_age_check_confirmed","section":"compliance","categories":["adults_only"],"label":"Customers are 18+: we check ID on first access and again at checkout","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.6","sort":602},
  {"key":"ao_discreet_packaging_confirmed","section":"compliance","categories":["adults_only"],"label":"Orders leave in plain, unmarked packaging that does not reveal what is inside","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F2.6","sort":603},

  {"key":"fa_sizing_standard","section":"compliance","categories":["fashion_apparel"],"label":"Sizing standard you use","type":"text","required":"yes","source":"Addendum F3.1","sort":700,"placeholder":"UK, EU or US"},
  {"key":"fa_material_care","section":"compliance","categories":["fashion_apparel"],"label":"Do your listings show material and care information?","type":"yes_no","required":"yes","source":"Addendum F3.1","sort":701},

  {"key":"be_in_person","section":"compliance","categories":["beauty"],"label":"Do you offer in-person services (salon, spa or home visits)?","type":"yes_no","required":"yes","requires_doc":"business_permit","source":"Addendum F3.2","sort":800},
  {"key":"be_permit_number","section":"compliance","categories":["beauty"],"label":"County single business permit number","type":"text","required":"conditional","required_when":{"field":"be_in_person","equals":"yes"},"source":"Addendum F3.2","sort":801,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"be_hygiene_confirmed","section":"compliance","categories":["beauty"],"label":"Our staff follow hygiene standards for in-person services","type":"yes_no","required":"conditional","required_when":{"field":"be_in_person","equals":"yes"},"must_be_yes":true,"source":"Addendum F3.2","sort":802},
  {"key":"be_salon_premises","section":"compliance","categories":["beauty"],"label":"Do you run salon or spa premises?","type":"yes_no","required":"yes","source":"Addendum F3.2","sort":803},
  {"key":"be_health_certificate","section":"compliance","categories":["beauty"],"label":"Public health certificate number","type":"text","required":"conditional","required_when":{"field":"be_salon_premises","equals":"yes"},"source":"Addendum F3.2","sort":804,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"be_ingredient_info","section":"compliance","categories":["beauty"],"label":"Do your cosmetic listings show ingredients and allergens?","type":"yes_no","required":"yes","source":"Addendum F3.2","sort":805},

  {"key":"ex_description","section":"compliance","categories":["experiences"],"label":"Describe your experience","hint":"How long it lasts, what is included, and any age or fitness restrictions.","type":"long_text","required":"yes","source":"Addendum F3.3","sort":900},
  {"key":"ex_physical","section":"compliance","categories":["experiences"],"label":"Is it a physical or adventure experience?","type":"yes_no","required":"yes","source":"Addendum F3.3","sort":901},
  {"key":"ex_public_liability_policy","section":"compliance","categories":["experiences"],"label":"Public liability insurance policy number","type":"text","required":"conditional","required_when":{"field":"ex_physical","equals":"yes"},"source":"Addendum F3.3","sort":902,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},

  {"key":"fg_delivery_window","section":"compliance","categories":["flowers_gifts"],"label":"Delivery window you commit to","type":"text","required":"yes","source":"Addendum F3.4","sort":1000,"placeholder":"Same day, within a 2-hour window"},
  {"key":"fg_perishable_handling","section":"compliance","categories":["flowers_gifts"],"label":"How do you keep flowers and perishables fresh?","type":"long_text","required":"yes","source":"Addendum F3.4","sort":1001},

  {"key":"rf_food_handler_numbers","section":"compliance","categories":["restaurants_food"],"label":"Food handler certificate numbers","hint":"One for each person who handles food, separated by commas.","type":"long_text","required":"yes","source":"Addendum F3.5","sort":1100},
  {"key":"rf_health_permit_number","section":"compliance","categories":["restaurants_food"],"label":"County health or business permit number","hint":"Public Health Act, Cap. 242.","type":"text","required":"yes","source":"Addendum F3.5","sort":1101,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"rf_health_permit_expiry","section":"compliance","categories":["restaurants_food"],"label":"Permit expiry date","type":"date","required":"yes","future_date":true,"source":"Addendum F3.5","sort":1102},
  {"key":"rf_allergen_info","section":"compliance","categories":["restaurants_food"],"label":"Do your listings show allergen and ingredient information where you have it?","type":"yes_no","required":"yes","source":"Addendum F3.5","sort":1103},

  {"key":"gr_permit_number","section":"compliance","categories":["groceries_essentials"],"label":"County single business permit number","type":"text","required":"yes","source":"Addendum F3.6","sort":1200,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"gr_fresh_produce","section":"compliance","categories":["groceries_essentials"],"label":"Do you sell fresh produce, meat or dairy?","type":"yes_no","required":"yes","source":"Addendum F3.6","sort":1201},
  {"key":"gr_fresh_compliance_confirmed","section":"compliance","categories":["groceries_essentials"],"label":"We meet public health and food-safety rules for fresh produce, meat and dairy","type":"yes_no","required":"conditional","required_when":{"field":"gr_fresh_produce","equals":"yes"},"must_be_yes":true,"source":"Addendum F3.6","sort":1202},
  {"key":"gr_substitution_confirmed","section":"compliance","categories":["groceries_essentials"],"label":"We substitute an item only when the customer agrees through NexG","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F3.6","sort":1203},

  {"key":"lc_turnaround","section":"compliance","categories":["laundry_cleaning"],"label":"Turnaround time you commit to","type":"text","required":"yes","source":"Addendum F3.7","sort":1300,"placeholder":"48 hours"},
  {"key":"lc_care_limits_confirmed","section":"compliance","categories":["laundry_cleaning"],"label":"We tell customers our care limits and the items we do not accept","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F3.7","sort":1301},
  {"key":"lc_liability_cap_confirmed","section":"compliance","categories":["laundry_cleaning"],"label":"We tell customers our liability cap when they book","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F3.7","sort":1302},

  {"key":"mp_permit_required","section":"compliance","categories":["marketplace"],"label":"Does your county require a business permit for what you sell?","type":"yes_no","required":"yes","requires_doc":"business_permit","source":"Addendum F3.8","sort":1400},
  {"key":"mp_permit_number","section":"compliance","categories":["marketplace"],"label":"County business permit number","type":"text","required":"conditional","required_when":{"field":"mp_permit_required","equals":"yes"},"source":"Addendum F3.8","sort":1401,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"mp_condition_confirmed","section":"compliance","categories":["marketplace"],"label":"Our listings say whether each product is new or used","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F3.8","sort":1402},
  {"key":"mp_consumer_protection_confirmed","section":"compliance","categories":["marketplace"],"label":"We comply with the Consumer Protection Act, 2012","type":"yes_no","required":"yes","must_be_yes":true,"source":"Addendum F3.8","sort":1403},

  {"key":"te_country_of_origin","section":"compliance","categories":["tech_electronics"],"label":"Do your listings show each product's country of origin?","type":"yes_no","required":"yes","source":"Addendum F3.9","sort":1500},

  {"key":"we_in_person","section":"compliance","categories":["wellness"],"label":"Do you offer in-person services?","type":"yes_no","required":"yes","requires_doc":"business_permit","source":"Addendum F3.10","sort":1600},
  {"key":"we_permit_number","section":"compliance","categories":["wellness"],"label":"County single business permit number","type":"text","required":"conditional","required_when":{"field":"we_in_person","equals":"yes"},"source":"Addendum F3.10","sort":1601,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"we_regulated_practitioner","section":"compliance","categories":["wellness"],"label":"Do regulated practitioners (for example physiotherapists) deliver your services?","type":"yes_no","required":"yes","source":"Addendum F3.10","sort":1602},
  {"key":"we_practitioner_registration","section":"compliance","categories":["wellness"],"label":"Practitioner professional registration number","type":"text","required":"conditional","required_when":{"field":"we_regulated_practitioner","equals":"yes"},"source":"Addendum F3.10","sort":1603,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"we_invasive","section":"compliance","categories":["wellness"],"label":"Do you offer physically invasive services?","type":"yes_no","required":"yes","source":"Addendum F3.10","sort":1604},
  {"key":"we_liability_policy","section":"compliance","categories":["wellness"],"label":"Liability insurance policy number","type":"text","required":"conditional","required_when":{"field":"we_invasive","equals":"yes"},"source":"Addendum F3.10","sort":1605,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"we_contraindications","section":"compliance","categories":["wellness"],"label":"Do you give customers health and contraindication information?","type":"yes_no","required":"yes","source":"Addendum F3.10","sort":1606},

  {"key":"ls_transit_policy","section":"compliance","categories":["logistics_shipping"],"label":"Goods-in-transit insurance policy number","hint":"Cover suited to the value of the goods you usually carry.","type":"text","required":"yes","source":"Addendum F3.11","sort":1700,"pattern":"^[A-Z0-9][A-Z0-9 ./_-]{2,59}$"},
  {"key":"ls_cross_border","section":"compliance","categories":["logistics_shipping"],"label":"Do you carry cross-border or dangerous goods?","type":"yes_no","required":"yes","source":"Addendum F3.11","sort":1701},
  {"key":"ls_customs_confirmed","section":"compliance","categories":["logistics_shipping"],"label":"We comply with customs and dangerous-goods rules","type":"yes_no","required":"conditional","required_when":{"field":"ls_cross_border","equals":"yes"},"must_be_yes":true,"source":"Addendum F3.11","sort":1702}
]$fields$::jsonb) as x(
  key text, section text, categories text[], label text, hint text, type text, options jsonb,
  columns jsonb, pattern text, placeholder text, required text, required_when jsonb,
  must_be_yes boolean, future_date boolean, requires_doc text, source text, sort integer);

update public.merchant_onboarding_field
set options = (
  select jsonb_agg(jsonb_build_object('value', c, 'label', c) order by c)
  from unnest(array[
    'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay',
    'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii',
    'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera',
    'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Murang''a', 'Nairobi', 'Nakuru', 'Nandi', 'Narok',
    'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River',
    'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
  ]) c
)
where key = 'county';

-- ------------------------------------------------------------------ checks

/* Why a date answer is not acceptable, or null. */
create function public.fn_merchant_onboarding_date_error(p_value jsonb, p_future boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v date;
begin
  if jsonb_typeof(p_value) is distinct from 'string'
     or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return 'needs a date';
  end if;
  begin
    v := (p_value #>> '{}')::date;
  exception when others then
    return 'needs a real date';
  end;
  if v < date '1990-01-01' or v > date '2100-12-31' then
    return 'needs a real date';
  end if;
  return null;
end;
$$;

/* Why an answer is not acceptable for its field, or null when it is. */
create function public.fn_merchant_onboarding_value_error(
  p_field public.merchant_onboarding_field,
  p_value jsonb
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
  v_row jsonb;
  v_col jsonb;
  v_err text;
  v_n integer := 0;
begin
  if p_field.type in ('text', 'long_text') then
    if jsonb_typeof(p_value) is distinct from 'string' then
      return 'needs text';
    end if;
    v := trim(p_value #>> '{}');
    if length(v) < 2 then
      return 'is too short';
    end if;
    if length(v) > (case when p_field.type = 'text' then 200 else 2000 end) then
      return 'is too long';
    end if;
    if p_field.pattern is not null and v !~* p_field.pattern then
      return 'is not in the expected format';
    end if;
  elsif p_field.type = 'date' then
    v_err := public.fn_merchant_onboarding_date_error(p_value, p_field.future_date);
    if v_err is not null then
      return v_err;
    end if;
    if p_field.future_date and (p_value #>> '{}')::date < current_date then
      return 'has passed; renew it before you continue';
    end if;
  elsif p_field.type = 'yes_no' then
    if p_value is distinct from '"yes"'::jsonb and p_value is distinct from '"no"'::jsonb then
      return 'needs Yes or No';
    end if;
  elsif p_field.type = 'select' then
    if jsonb_typeof(p_value) is distinct from 'string' or not exists (
      select 1 from jsonb_array_elements(p_field.options) o
      where o.value ->> 'value' = p_value #>> '{}'
    ) then
      return 'needs one of the listed options';
    end if;
  elsif p_field.type = 'rows' then
    if jsonb_typeof(p_value) is distinct from 'array'
       or jsonb_array_length(p_value) not between 1 and 50 then
      return 'needs at least one row';
    end if;
    for v_row in select value from jsonb_array_elements(p_value) loop
      v_n := v_n + 1;
      if jsonb_typeof(v_row) is distinct from 'object' or exists (
        select 1 from jsonb_object_keys(v_row) k
        where not exists (
          select 1 from jsonb_array_elements(p_field.columns) c where c.value ->> 'key' = k
        )
      ) then
        return 'has an unknown column';
      end if;
      for v_col in select value from jsonb_array_elements(p_field.columns) loop
        if v_col ->> 'type' = 'date' then
          v_err := public.fn_merchant_onboarding_date_error(v_row -> (v_col ->> 'key'), false);
          if v_err is null and coalesce((v_col ->> 'future_date')::boolean, false)
             and (v_row ->> (v_col ->> 'key'))::date < current_date then
            v_err := 'has passed; renew it before you continue';
          end if;
        elsif jsonb_typeof(v_row -> (v_col ->> 'key')) is distinct from 'string'
              or length(trim(v_row ->> (v_col ->> 'key'))) not between 2 and 200 then
          v_err := 'is missing';
        elsif v_col ? 'pattern' and trim(v_row ->> (v_col ->> 'key')) !~* (v_col ->> 'pattern') then
          v_err := 'is not in the expected format';
        end if;
        if v_err is not null then
          return format('row %s: %s %s', v_n, v_col ->> 'label', v_err);
        end if;
      end loop;
    end loop;
  end if;
  return null;
end;
$$;

/* The category a merchant is onboarding into: the application's, else the merchant's. */
create function public.fn_merchant_onboarding_category(p_merchant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(a.payload ->> 'categoryId', ''), nullif(m.category_key, ''), m.category::text)
  from public.merchant m
  left join public.merchant_application a on a.merchant_id = m.id
  where m.id = p_merchant_id;
$$;

/* Required fields for a category that these answers leave missing: [{key, label}]. */
create function public.fn_merchant_onboarding_missing_for(p_category text, p_answers jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label) order by f.sort),
                  '[]'::jsonb)
  from public.merchant_onboarding_field f
  where (f.categories is null or p_category = any (f.categories))
    and (
      f.required = 'yes'
      or (f.required = 'conditional'
          and p_answers ->> (f.required_when ->> 'field') = f.required_when ->> 'equals')
    )
    and (
      not coalesce(p_answers, '{}'::jsonb) ? f.key
      or public.fn_merchant_onboarding_value_error(f, p_answers -> f.key) is not null
      or (f.must_be_yes and p_answers ->> f.key is distinct from 'yes')
    );
$$;

/*
 * Everything a merchant still owes the template: the missing fields, plus the
 * business registration number, which the template requires and the
 * agreement details hold.
 */
create function public.fn_merchant_onboarding_missing(p_merchant_id uuid, p_category text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_merchant_onboarding_missing_for(
           coalesce(p_category, public.fn_merchant_onboarding_category(p_merchant_id)),
           coalesce((select oa.answers from public.merchant_onboarding_answer oa
                     where oa.merchant_id = p_merchant_id), '{}'::jsonb))
    || case when exists (
         select 1 from public.merchant_agreement_party p
         where p.merchant_id = p_merchant_id
           and nullif(trim(coalesce(p.registration_number, '')), '') is not null
       ) then '[]'::jsonb
       else jsonb_build_array(jsonb_build_object(
         'key', 'registration_number', 'label', 'Business registration number'))
       end;
$$;

/* The fields that apply to a category, as the form and the review read them. */
create function public.fn_merchant_onboarding_fields_json(p_category text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', f.key, 'section', f.section, 'label', f.label, 'hint', f.hint,
           'type', f.type, 'options', f.options, 'columns', f.columns, 'pattern', f.pattern,
           'placeholder', f.placeholder, 'required', f.required,
           'required_when', f.required_when, 'must_be_yes', f.must_be_yes,
           'future_date', f.future_date, 'source', f.source
         ) order by f.sort), '[]'::jsonb)
  from public.merchant_onboarding_field f
  where f.categories is null or p_category = any (f.categories);
$$;

-- ------------------------------------------------------------------ read / save

/*
 * The onboarding details for a merchant (the owner, a member, or staff who
 * reach Merchants), or, with no merchant yet, the fields for a category so the
 * registration form can show them before the first save.
 */
create function public.rpc_merchant_onboarding_read(
  p_merchant_id uuid default null,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_answers jsonb := '{}'::jsonb;
  v_updated timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_merchant_id is null then
    v_category := nullif(trim(coalesce(p_category, '')), '');
    return jsonb_build_object(
      'category', v_category,
      'fields', public.fn_merchant_onboarding_fields_json(v_category),
      'answers', '{}'::jsonb,
      'missing', public.fn_merchant_onboarding_missing_for(v_category, '{}'::jsonb),
      'updated_at', null);
  end if;
  if not exists (select 1 from public.merchant where id = p_merchant_id) then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  if not (
    authz.merchant_application_owner(p_merchant_id)
    or authz.is_merchant_member(p_merchant_id)
    or authz.merchant_application_staff(p_merchant_id)
    or ((authz.is_super_admin() or authz.reaches_module('merchants'))
        and authz.works_merchant(p_merchant_id))
  ) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  v_category := coalesce(nullif(trim(coalesce(p_category, '')), ''),
                         public.fn_merchant_onboarding_category(p_merchant_id));
  select oa.answers, oa.updated_at into v_answers, v_updated
  from public.merchant_onboarding_answer oa where oa.merchant_id = p_merchant_id;
  return jsonb_build_object(
    'category', v_category,
    'fields', public.fn_merchant_onboarding_fields_json(v_category),
    'answers', coalesce(v_answers, '{}'::jsonb),
    'missing', public.fn_merchant_onboarding_missing(p_merchant_id, v_category),
    'updated_at', v_updated);
end;
$$;

/*
 * Saves some or all of the answers. A key set to null or '' clears it; keys
 * not sent are kept. Every value is checked against its field, and a field
 * that does not apply to the merchant's category is refused.
 */
create function public.rpc_merchant_onboarding_save(p_merchant_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_answers jsonb;
  v_field public.merchant_onboarding_field;
  v_key text;
  v_value jsonb;
  v_err text;
  v_changed text[] := '{}';
begin
  if (select auth.uid()) is null or not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Only the business owner can complete the onboarding details.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text) > 65536 then
    raise exception 'Send the onboarding details.' using errcode = '22023';
  end if;
  v_category := public.fn_merchant_onboarding_category(p_merchant_id);

  select oa.answers into v_answers
  from public.merchant_onboarding_answer oa where oa.merchant_id = p_merchant_id for update;
  v_answers := coalesce(v_answers, '{}'::jsonb);

  for v_key, v_value in select * from jsonb_each(p_answers) loop
    select * into v_field from public.merchant_onboarding_field f
    where f.key = v_key and (f.categories is null or v_category = any (f.categories));
    if v_field.key is null then
      raise exception 'Unknown onboarding detail: %.', v_key using errcode = '22023';
    end if;
    if v_value = 'null'::jsonb or v_value = '""'::jsonb or v_value = '[]'::jsonb then
      if v_answers ? v_key then
        v_answers := v_answers - v_key;
        v_changed := v_changed || v_key;
      end if;
      continue;
    end if;
    if jsonb_typeof(v_value) = 'string' then
      v_value := to_jsonb(trim(v_value #>> '{}'));
    end if;
    v_err := public.fn_merchant_onboarding_value_error(v_field, v_value);
    if v_err is not null then
      raise exception '%: %.', v_field.label, v_err using errcode = '22023';
    end if;
    if v_answers -> v_key is distinct from v_value then
      v_answers := jsonb_set(v_answers, array[v_key], v_value);
      v_changed := v_changed || v_key;
    end if;
  end loop;

  if cardinality(v_changed) > 0 then
    insert into public.merchant_onboarding_answer (merchant_id, answers, updated_by, updated_at)
    values (p_merchant_id, v_answers, (select auth.uid()), now())
    on conflict (merchant_id) do update
      set answers = excluded.answers, updated_by = excluded.updated_by, updated_at = now();
    -- Field keys only: the values are licence and ID numbers.
    perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
      p_action => 'merchant.onboarding_details_saved', p_target_type => 'merchant',
      p_target_id => p_merchant_id, p_after => jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;

  return public.rpc_merchant_onboarding_read(p_merchant_id, null);
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, pii_fields, two_person, money, description)
values ('merchant.onboarding_details_saved', 'merchants', 'info', false, '{}', false, false,
        'A merchant saved its onboarding template details (field names only)')
on conflict (action) do nothing;

-- ------------------------------------------------------------------ submit check

/* An application cannot be submitted while the template's required details are missing. */
create function public.tg_merchant_application_onboarding_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing jsonb;
begin
  if new.submitted_revision is not null
     and new.submitted_revision is distinct from old.submitted_revision then
    v_missing := public.fn_merchant_onboarding_missing(
      new.merchant_id, nullif(new.payload ->> 'categoryId', ''));
    if jsonb_array_length(v_missing) > 0 then
      raise exception 'Complete your onboarding details before submitting: %.',
        (select string_agg(m.value ->> 'label', '; ')
         from (select value from jsonb_array_elements(v_missing) limit 5) m)
        || case when jsonb_array_length(v_missing) > 5
             then format(' and %s more', jsonb_array_length(v_missing) - 5) else '' end
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger merchant_application_onboarding_required
  before update of submitted_revision on public.merchant_application
  for each row execute function public.tg_merchant_application_onboarding_required();

-- ------------------------------------------------------------------ documents

/* The owner ID copy and KRA PIN certificate are required again (template, Common Fields). */
update public.document_requirement
set required = true, essential = true
where owner_type = 'merchant' and kind in ('owner_id', 'kra_pin');

/* The county permit only where an addendum asks for it: restaurants and
   groceries always; beauty, wellness, marketplace and vehicle services when
   their yes/no question says so (merchant_onboarding_field.requires_doc). */
update public.document_requirement
set applies_when = '{"category": ["restaurants_food", "groceries_essentials", "restaurant", "supermarket"]}'::jsonb,
    why_text = 'Your county permit to trade · needed to go live'
where owner_type = 'merchant' and kind = 'business_permit';

insert into public.document_requirement
  (owner_type, kind, label, why_text, applies_when, has_expiry, required, essential, sort)
values
  ('merchant', 'business_registration_cert', 'Business registration certificate',
   'Certificate of registration or incorporation (CR12 or equivalent)',
   '{}'::jsonb, false, true, true, 15),
  ('merchant', 'transfer_compliance_bundle', 'PSV licence, insurance and roadworthiness certificates',
   'One PDF with each vehicle''s PSV licence, motor insurance and NTSA roadworthiness certificate',
   '{"category": ["airport_transfers"]}'::jsonb, false, true, true, 100),
  ('merchant', 'tra_licence', 'TRA licence',
   'Tourism Regulatory Authority tour operator or travel agent licence',
   '{"category": ["travel_tours"]}'::jsonb, true, true, true, 101),
  ('merchant', 'cancellation_policy', 'Cancellation and refund policy',
   'Your cancellation, rescheduling and refund terms · shown on each listing',
   '{"category": ["travel_tours", "experiences"]}'::jsonb, false, true, true, 102),
  ('merchant', 'returns_policy', 'Returns and exchange policy',
   'Must match NexG''s refund policy',
   '{"category": ["fashion_apparel"]}'::jsonb, false, true, true, 103),
  ('merchant', 'menu_price_list', 'Menu and price list',
   'Your prices on NexG must match it',
   '{"category": ["restaurants_food"]}'::jsonb, false, true, true, 104),
  ('merchant', 'laundry_intake_process', 'Intake and handover process',
   'How you record items when you collect and return them',
   '{"category": ["laundry_cleaning"]}'::jsonb, false, true, true, 105),
  ('merchant', 'warranty_terms', 'Warranty terms',
   'Manufacturer or your own warranty',
   '{"category": ["tech_electronics"]}'::jsonb, false, true, true, 106),
  ('merchant', 'chain_of_custody_process', 'Proof of collection and delivery process',
   'How you keep chain of custody from collection to delivery',
   '{"category": ["logistics_shipping"]}'::jsonb, false, true, true, 107)
on conflict (owner_type, kind) do nothing;

/* Document kinds a merchant's yes/no onboarding answers call for. */
create function public.fn_merchant_onboarding_docs(p_merchant_id uuid, p_category text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct f.requires_doc
  from public.merchant_onboarding_answer oa
  join public.merchant_onboarding_field f
    on f.requires_doc is not null
   and (f.categories is null or p_category = any (f.categories))
   and oa.answers ->> f.key = 'yes'
  where oa.merchant_id = p_merchant_id;
$$;

grant execute on function public.fn_merchant_onboarding_docs(uuid, text)
  to anon, authenticated, service_role;

/* fn_merchant_required_docs also asks for a document a yes/no onboarding answer calls for. */
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
    union
    select k.kind from subject s
    cross join lateral public.fn_merchant_onboarding_docs(p_merchant_id, s.cat) k(kind)
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

-- ------------------------------------------------------------------ grants

revoke all on function public.fn_merchant_onboarding_date_error(jsonb, boolean),
  public.fn_merchant_onboarding_value_error(public.merchant_onboarding_field, jsonb),
  public.fn_merchant_onboarding_category(uuid),
  public.fn_merchant_onboarding_missing_for(text, jsonb),
  public.fn_merchant_onboarding_missing(uuid, text),
  public.fn_merchant_onboarding_fields_json(text),
  public.rpc_merchant_onboarding_read(uuid, text),
  public.rpc_merchant_onboarding_save(uuid, jsonb),
  public.tg_merchant_application_onboarding_required()
  from public, anon, authenticated;

grant execute on function public.rpc_merchant_onboarding_read(uuid, text),
  public.rpc_merchant_onboarding_save(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.fn_merchant_onboarding_missing(uuid, text) to service_role;
