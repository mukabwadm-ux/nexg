-- What we ask a business, decided by what the business is.
--
-- A laundry should never see a question about alcohol, and a pharmacy should
-- be asked about its superintendent before it is asked about parking. Until
-- now those follow-ups did not exist; the form asked everyone the same six
-- things and a merchant team member filled the gaps on the call.
--
-- The questions live in the database rather than in a TypeScript constant for
-- one reason: the answers decide which documents we demand, and that decision
-- has to be made by the same rule on the server that the merchant saw on the
-- screen. A constant in the web bundle cannot be consulted by
-- fn_merchant_required_docs.

create table public.category_config (
  category public.merchant_category primary key,
  label text not null,
  /* lucide-react icon name; the web app maps it to a component. */
  icon text not null,
  /* Whether this business has a menu, a service list or a shelf. */
  card_kind text not null check (card_kind in ('menu', 'services', 'products')),
  /* A restaurant delivers in minutes; a laundry comes back tomorrow. */
  eta_style text not null check (eta_style in ('minutes', 'turnaround')),
  questions jsonb not null default '[]',
  badge_rules jsonb not null default '{}',
  /* Paid placement is a promise about relevance. We do not sell it against
     medicines. */
  featured_eligible boolean not null default true,
  extra_doc_rules jsonb not null default '[]',
  /* "Something else" needs a human to decide what it actually is. */
  requires_ops_mapping boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger category_config_set_updated_at
  before update on public.category_config
  for each row execute function public.tg_set_updated_at();

comment on table public.category_config is
  'The follow-up questions, badges and extra documents for each kind of business. Read by anon: step 2 renders before anyone has signed in.';
comment on column public.category_config.questions is
  'Ordered array of {key, label, type: single|multi, options: [{value,label}], hint}. The answers land in merchant.answers under these keys.';
comment on column public.category_config.extra_doc_rules is
  'Array of {when: {answer_key: value}, doc: requirement_kind}. Evaluated by fn_merchant_required_docs against merchant.answers.';

alter table public.category_config enable row level security;

create policy category_config_read_public on public.category_config
  for select to anon, authenticated using (true);

/* Nobody edits this from the application. It changes by migration, because a
   new question changes which documents we are legally asking for. */

-- ------------------------------------------------------------------ seed
--
-- The labels and hints are the artboards' copy, verbatim (ground rule 6).

insert into public.category_config
  (category, label, icon, card_kind, eta_style, sort, featured_eligible,
   requires_ops_mapping, questions, badge_rules, extra_doc_rules)
values
(
  'restaurant', 'Restaurant', 'Utensils', 'menu', 'minutes', 1, true, false,
  $j$[
    {"key":"cuisine","label":"What kind of restaurant?","type":"single","options":[
      {"value":"nyama_choma","label":"Nyama choma"},{"value":"swahili","label":"Swahili coast"},
      {"value":"fast_food","label":"Fast food"},{"value":"fine_dining","label":"Fine dining"},
      {"value":"cafe_bakery","label":"Café & bakery"},{"value":"indian","label":"Indian"},
      {"value":"chinese","label":"Chinese"},{"value":"pizza","label":"Pizza"},
      {"value":"other","label":"Other"}]},
    {"key":"serves_alcohol","label":"Do you serve alcohol?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}],
      "hint":"If yes, we will ask for your liquor licence later — nothing to do now."},
    {"key":"dietary","label":"Dietary options you cover","type":"multi","options":[
      {"value":"halal","label":"Halal"},{"value":"vegetarian","label":"Vegetarian"},
      {"value":"vegan","label":"Vegan"},{"value":"gluten_free","label":"Gluten-free"}],
      "hint":"Guests filter by these. Pick only what you can guarantee."},
    {"key":"spend_band","label":"Typical order for one person","type":"single","options":[
      {"value":"under_500","label":"Under KES 500"},{"value":"500_1500","label":"KES 500–1,500"},
      {"value":"1500_3000","label":"KES 1,500–3,000"},{"value":"3000_plus","label":"KES 3,000+"}],
      "hint":"Sets the price band shown on your card. You can change it."}
  ]$j$::jsonb,
  $j$ {"dietary":{"halal":{"text":"HALAL","tone":"success"},
                 "vegetarian":{"text":"VEGETARIAN","tone":"success"},
                 "vegan":{"text":"VEGAN","tone":"success"},
                 "gluten_free":{"text":"GLUTEN-FREE","tone":"success"}},
       "serves_alcohol":{"yes":{"text":"SERVES ALCOHOL","tone":"neutral"}},
       "spend_band":{"under_500":{"text":"UNDER KES 500","tone":"neutral"},
                     "500_1500":{"text":"KES 500–1,500","tone":"neutral"},
                     "1500_3000":{"text":"KES 1,500–3,000","tone":"neutral"},
                     "3000_plus":{"text":"KES 3,000+","tone":"neutral"}}} $j$::jsonb,
  $j$ [{"when":{"serves_alcohol":"yes"},"doc":"liquor_licence"}] $j$::jsonb
),
(
  'bar_liquor', 'Bar & drinks', 'Wine', 'menu', 'minutes', 2, true, false,
  $j$[
    {"key":"venue_type","label":"What kind of place is it?","type":"single","options":[
      {"value":"bar","label":"Bar"},{"value":"wine_spirits_shop","label":"Wine & spirits shop"},
      {"value":"liquor_store","label":"Liquor store"}]},
    {"key":"sells_food","label":"Do you sell food too?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}]},
    {"key":"min_order","label":"Minimum order","type":"single","options":[
      {"value":"none","label":"No minimum"},{"value":"1000","label":"KES 1,000"},
      {"value":"2000","label":"KES 2,000"}]},
    {"key":"id_check","label":"Age checks","type":"single","options":[
      {"value":"yes","label":"Riders check ID on delivery"}],
      "hint":"Not optional. Every alcohol order is handed over against an ID."}
  ]$j$::jsonb,
  $j$ {"sells_food":{"yes":{"text":"FOOD TOO","tone":"neutral"}},
       "id_check":{"yes":{"text":"18+ · ID CHECKED","tone":"success"}}} $j$::jsonb,
  $j$ [] $j$::jsonb
),
(
  'laundry', 'Laundry', 'Shirt', 'services', 'turnaround', 3, true, false,
  $j$[
    {"key":"services","label":"What do you do?","type":"multi","options":[
      {"value":"wash_fold","label":"Wash & fold"},{"value":"wash_iron","label":"Wash & iron"},
      {"value":"dry_clean","label":"Dry cleaning"},{"value":"shoes","label":"Shoe cleaning"},
      {"value":"duvets_curtains","label":"Duvets & curtains"},
      {"value":"express","label":"Express same-day"}],
      "hint":"Pick everything you offer. Guests see these as services, not a menu."},
    {"key":"pricing_basis","label":"How do you price?","type":"single","options":[
      {"value":"per_bag","label":"Per bag / kg"},{"value":"per_item","label":"Per item"},
      {"value":"both","label":"Both"}],
      "hint":"Per-bag is what most guests expect. We will ask for one price per bag size on the next step."},
    {"key":"turnaround","label":"Turnaround for a standard bag","type":"single","options":[
      {"value":"same_day","label":"Same day"},{"value":"next_day","label":"Next day"},
      {"value":"48h","label":"48 hours"},{"value":"3_plus","label":"3+ days"}],
      "hint":"Shown on your card as \"back by tomorrow\". Express can be priced separately."},
    {"key":"collection","label":"Collection from the guest","type":"single","options":[
      {"value":"rider_collects","label":"NexG rider collects"},
      {"value":"guest_drops","label":"Guest drops off"},{"value":"either","label":"Either"}],
      "hint":"If a rider collects, the guest pays the delivery fee both ways. You pay nothing."}
  ]$j$::jsonb,
  $j$ {"collection":{"rider_collects":{"text":"RIDER COLLECTS","tone":"success"},
                     "either":{"text":"RIDER COLLECTS","tone":"success"}},
       "services":{"express":{"text":"EXPRESS SAME-DAY","tone":"neutral"}},
       "pricing_basis":{"per_bag":{"text":"PER BAG","tone":"neutral"},
                        "per_item":{"text":"PER ITEM","tone":"neutral"},
                        "both":{"text":"PER BAG OR ITEM","tone":"neutral"}}} $j$::jsonb,
  $j$ [] $j$::jsonb
)
on conflict (category) do nothing;

insert into public.category_config
  (category, label, icon, card_kind, eta_style, sort, featured_eligible,
   requires_ops_mapping, questions, badge_rules, extra_doc_rules)
values
(
  'florist', 'Flowers & gifts', 'Flower2', 'products', 'minutes', 4, true, false,
  $j$[
    {"key":"makes","label":"What do you make?","type":"multi","options":[
      {"value":"bouquets","label":"Bouquets"},{"value":"arrangements","label":"Arrangements"},
      {"value":"hampers","label":"Hampers"},{"value":"cakes","label":"Cakes"}]},
    {"key":"lead_time","label":"How much notice do you need?","type":"single","options":[
      {"value":"same_day","label":"Same day"},{"value":"next_day","label":"Next day"},
      {"value":"48h","label":"48 hours"}]},
    {"key":"custom_message","label":"Handwritten card with the order?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}],
      "hint":"Guests type the message at checkout and you write it by hand."},
    {"key":"occasions","label":"Occasions you cover","type":"multi","options":[
      {"value":"birthday","label":"Birthday"},{"value":"anniversary","label":"Anniversary"},
      {"value":"sympathy","label":"Sympathy"},{"value":"corporate","label":"Corporate"}]}
  ]$j$::jsonb,
  $j$ {"lead_time":{"same_day":{"text":"SAME DAY","tone":"success"}},
       "custom_message":{"yes":{"text":"HANDWRITTEN CARD","tone":"neutral"}}} $j$::jsonb,
  $j$ [] $j$::jsonb
),
(
  'beauty_fashion', 'Beauty & fashion', 'Scissors', 'products', 'minutes', 5, true, false,
  $j$[
    {"key":"offering","label":"What do you offer?","type":"single","options":[
      {"value":"products","label":"Products"},{"value":"services","label":"Services"},
      {"value":"both","label":"Both"}]},
    {"key":"returns","label":"Returns","type":"single","options":[
      {"value":"accepted","label":"Accepted"},{"value":"exchange_only","label":"Exchange only"},
      {"value":"none","label":"No returns"}],
      "hint":"Shown to the guest before they order. Be honest — disputes cost you more."},
    {"key":"home_service","label":"Do you go to the guest?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}],
      "hint":"If yes, we will ask for your cosmetology licence later."}
  ]$j$::jsonb,
  $j$ {"home_service":{"yes":{"text":"COMES TO YOU","tone":"success"}},
       "returns":{"accepted":{"text":"RETURNS ACCEPTED","tone":"success"}}} $j$::jsonb,
  $j$ [{"when":{"home_service":"yes"},"doc":"cosmetology_licence"}] $j$::jsonb
),
(
  'pharmacy', 'Pharmacy', 'Pill', 'products', 'minutes', 6, false, false,
  $j$[
    {"key":"orderable","label":"What can guests order?","type":"multi","options":[
      {"value":"otc","label":"Over-the-counter medicines"},
      {"value":"prescription","label":"Prescription medicines"},
      {"value":"first_aid_wellness","label":"First aid & wellness"},
      {"value":"baby_personal","label":"Baby & personal care"},
      {"value":"medical_supplies","label":"Medical supplies"}]},
    {"key":"dispenses_rx","label":"Prescriptions","type":"single","options":[
      {"value":"yes","label":"We dispense with an uploaded prescription"},
      {"value":"no","label":"Over-the-counter only"}],
      "hint":"If you dispense, guests upload a photo of the prescription at checkout and your pharmacist confirms before the rider is sent."},
    {"key":"pharmacist_on_site","label":"Pharmacist on site during opening hours?","type":"single","options":[
      {"value":"always","label":"Always"},{"value":"some_hours","label":"Some hours"},
      {"value":"no","label":"No"}],
      "hint":"Required by the Pharmacy and Poisons Board for dispensing — we will ask for the pharmacist's licence number."},
    {"key":"late_night","label":"Late-night availability","type":"single","options":[
      {"value":"regular","label":"Regular hours"},{"value":"midnight","label":"Until midnight"},
      {"value":"24h","label":"24 hours"}],
      "hint":"Late-night pharmacy runs are one of the most common concierge requests from guests."}
  ]$j$::jsonb,
  $j$ {"dispenses_rx":{"yes":{"text":"PRESCRIPTIONS","tone":"success"}},
       "pharmacist_on_site":{"always":{"text":"PHARMACIST ON SITE","tone":"success"},
                             "some_hours":{"text":"PHARMACIST SOME HOURS","tone":"success"}},
       "late_night":{"regular":{"text":"REGULAR HOURS","tone":"neutral"},
                     "midnight":{"text":"OPEN TILL MIDNIGHT","tone":"neutral"},
                     "24h":{"text":"OPEN 24 HOURS","tone":"neutral"}}} $j$::jsonb,
  $j$ [{"when":{"dispenses_rx":"yes"},"doc":"pharmacist_licence"}] $j$::jsonb
),
(
  'supermarket', 'Supermarket', 'ShoppingCart', 'products', 'minutes', 7, true, false,
  $j$[
    {"key":"fresh_produce","label":"Do you sell fresh produce?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}],
      "hint":"If yes, we will ask for a food handler certificate."},
    {"key":"alcohol_aisle","label":"Is there an alcohol aisle?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"no","label":"No"}]},
    {"key":"substitutions","label":"If something is out of stock","type":"single","options":[
      {"value":"allowed","label":"Substitute a similar item"},
      {"value":"ask_first","label":"Ask the guest first"},
      {"value":"none","label":"Leave it out"}],
      "hint":"The concierge follows this without having to call you."},
    {"key":"min_basket","label":"Minimum basket","type":"single","options":[
      {"value":"none","label":"No minimum"},{"value":"1000","label":"KES 1,000"},
      {"value":"2000","label":"KES 2,000"}]}
  ]$j$::jsonb,
  $j$ {"fresh_produce":{"yes":{"text":"FRESH PRODUCE","tone":"success"}},
       "alcohol_aisle":{"yes":{"text":"SERVES ALCOHOL","tone":"neutral"}},
       "substitutions":{"ask_first":{"text":"ASKS BEFORE SUBSTITUTING","tone":"success"}}} $j$::jsonb,
  $j$ [{"when":{"alcohol_aisle":"yes"},"doc":"liquor_licence"},
       {"when":{"fresh_produce":"yes"},"doc":"food_handler_cert"}] $j$::jsonb
),
(
  'other', 'Something else', 'Gift', 'products', 'minutes', 8, true, true,
  $j$[
    {"key":"description","label":"Tell us what you sell","type":"text",
      "hint":"A sentence is enough. A person reads this one."},
    {"key":"nearest_category","label":"Which of these is closest?","type":"single","options":[
      {"value":"restaurant","label":"Restaurant"},{"value":"bar_liquor","label":"Bar & drinks"},
      {"value":"laundry","label":"Laundry"},{"value":"florist","label":"Flowers & gifts"},
      {"value":"beauty_fashion","label":"Beauty & fashion"},{"value":"pharmacy","label":"Pharmacy"},
      {"value":"supermarket","label":"Supermarket"}],
      "hint":"We use it to work out which documents to ask for. A person confirms it before you go live."}
  ]$j$::jsonb,
  $j$ {} $j$::jsonb,
  $j$ [] $j$::jsonb
)
on conflict (category) do nothing;

/*
 * gift_shop predates this flow and has no tile of its own — the artboard folds
 * flowers and gifts into one. Any existing gift_shop merchant keeps working;
 * new ones arrive as florist.
 */
insert into public.category_config
  (category, label, icon, card_kind, eta_style, sort, questions, badge_rules)
values ('gift_shop', 'Gifts', 'Gift', 'products', 'minutes', 9, '[]', '{}')
on conflict (category) do nothing;
