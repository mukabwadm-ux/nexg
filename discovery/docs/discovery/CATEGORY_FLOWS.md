# Official categories and complete journeys — V1.1

Owner baseline: exactly 16 main categories and 98 navigational subcategories, preserving labels, order and parent relationships. Every row below has an L2 entry, L3 result intent, L4 configuration and checkout destination. Default journeys are proposed intent mappings; authoritative item/provider workflow must resolve the actual path. Private events may require a service quote instead of ticketing; fixed-price cleaning may book rather than quote; bespoke travel/catering may request a quote. These variants use standalone workflow adapters with explicit platform contracts when integration is supported.

All entries: L1 main icon → L2 category with the shared scoped filter bar and one subcategory rail → selected L3 using the same filter-bar component and universal results system → original merchant storefront or selected offering L4 → journey below. L2 sort/location changes stay in that category; selecting a subcategory opens L3. No separate screen per subcategory.

Journey codes and exact failure/confirmation requirements are defined in [CHECKOUT_WORKFLOWS.md](CHECKOUT_WORKFLOWS.md). Nested candidates and current catalog mappings are in [TAXONOMY_CROSSWALK_V1.1.md](TAXONOMY_CROSSWALK_V1.1.md).

19 October clarification: the default journey column below preserves earlier intent guidance. The [complete workflow coverage map](../../discovery-engine/docs/WORKFLOW_COVERAGE.md) records conditional alternatives for every current subcategory, and the [workflow rule audit](../../discovery-engine/docs/WORKFLOW_RULE_AUDIT.md) records missing modules and evidence. Resolve actual operations per offering; do not use this single-default column as a dispatcher or proof of capability.

## 01. Adults Only — 3 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses merchant + product as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Erotic Products | Supported product variant; quantity; discreet fulfillment preference if actually offered | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 2. Tobacco & Vapes | Verified tobacco/vape variant; quantity; applicable product access policy | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 3. Adult Wellness | Actual wellness product variant, or service duration/slot when offering is a service | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |

## 02. Airport Transfers — 4 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses provider + service as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Airport Pickup | Arrival flight/time; pickup point; destination; party/luggage | **TRANSFER** — Service-area/capacity check → quote → review → transfer request/reservation status |
| 2. Airport Drop-off | Pickup address/time; airport/flight if relevant; party/luggage | **TRANSFER** — Service-area/capacity check → quote → review → transfer request/reservation status |
| 3. Meet & Greet | Flight/arrival; meeting point; party; actual assistance scope | **TRANSFER** — Service-area/capacity check → quote → review → transfer request/reservation status |
| 4. Executive Transfer | Route/date/time; party/luggage; verified executive vehicle capability | **TRANSFER** — Service-area/capacity check → quote → review → transfer request/reservation status |

## 03. Alcohol And Beverages — 7 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses merchant + product as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Wine | Wine variant/vintage and bottle or pack quantity if catalogued | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 2. Spirits | Spirit variant and bottle or pack quantity | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 3. Beer | Beer variant, container/pack and quantity | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 4. Champagne | Champagne variant, bottle or pack and quantity | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 5. Cocktail Mixers | Mixer variant, volume/pack and quantity | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 6. Liquor Stores | Merchant storefront → actual selected beverage and product-specific access policy | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 7. Non-Alcoholic Drinks | Drink/water variant, volume/pack and quantity; no alcohol restriction by association | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |

## 04. Apparel — 7 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses product + merchant as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Men's Fashion | Actual garment size/color variant; quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Women's Fashion | Actual garment size/color variant; quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Kids Fashion | Catalog size/age label and color variant; quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Shoes | Shoe size/color variant and quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Bags | Bag size/color/material variant where offered | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 6. Watches | Watch model/variant and stated warranty information | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 7. Fashion Accessories | Accessory model/color/variant and quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |

## 05. Beauty And Wellness — 7 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses merchant + product + service as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Beauty Products | Product-specific shade/size/volume or other catalog variant | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Spa | Actual spa treatment/package, duration and available slot | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |
| 3. Massage | Actual massage treatment/duration and available slot; Deep Tissue only if verified | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |
| 4. Gym | Actual visit/membership/package; start date/session if supported | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |
| 5. Personal Training | Actual training session/package; provider; supported slot/location | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |
| 6. Salon & Barber | Supported salon/barber service, duration/provider and available slot | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |
| 7. Nails & Beauty Services | Actual nails/beauty service, supported style/variant and slot | **APPOINTMENT** — Slot check/hold → review terms → supported booking/deposit → provider booking status |

## 06. Vehicle Rentals — 4 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses provider + service as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Car Rental | Vehicle offering; rental start/end; pickup/return; declared rental requirements | **RENTAL** — Capacity check → itemized rental quote and terms → reservation/payment → status |
| 2. Bike Rental | Bike offering; rental start/end; pickup/return; declared rental requirements | **RENTAL** — Capacity check → itemized rental quote and terms → reservation/payment → status |
| 3. Vehicle Repair | Vehicle/device details; actual repair task; service location; preferred schedule | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 4. Car Wash | Vehicle type; actual wash package; location and supported slot | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |

## 07. Experiences — 4 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses offering + provider as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Events | Dated event and actual tier/attendees; private events use scope/date/venue quote | **TICKET** — Capacity/hold → review → ticket payment if supported → issued tickets/status |
| 2. Photography | Photography brief; occasion/date/location; actual package or quote scope | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 3. Workshops & Classes | Actual class/workshop session; participant count and supported level | **TICKET** — Capacity/hold → review → ticket payment if supported → issued tickets/status |
| 4. Sports & Recreation | Actual activity/session; participants; supported equipment/venue options | **TICKET** — Capacity/hold → review → ticket payment if supported → issued tickets/status |

## 08. Flowers And Gifts — 6 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses product + merchant as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Flowers | Actual arrangement/size; recipient; supported delivery date and note | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Gift Hampers | Actual hamper/contents variants; recipient/date; supported substitutions | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Cakes | Actual cake size/flavor/customization; recipient/date; catalog lead time | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Chocolates | Actual box/pack variant; recipient/date; supported gift note | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Personalized Gifts | Actual product/customization text or asset through supported secure input; lead time | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 6. Occasion Gifts | Actual gift tagged for occasion; recipient/date; supported gift message | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |

## 09. Marketplace — 5 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses product + merchant as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Home & Living | Actual product dimensions/material/finish variant; fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Books & Stationery | Actual title/product/pack; quantity; supported fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. General Retail | Actual item/variant/quantity; product-specific configuration | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Hardware & DIY | Actual hardware/tool specifications and variant; fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Pet Supplies | Actual pet product type/size/pack; supported fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |

## 10. Restaurants And Food — 7 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses merchant + product as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Restaurant | Actual menu item/portion and supported modifiers; dietary facts; fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Fast Food | Actual meal/portion and supported extras; quantity; fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Café | Actual drink/food size and supported milk or other modifiers | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Bakery | Actual bakery item/quantity and supported customization | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Desserts | Actual dessert/size and supported extras; quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 6. Juice Bar | Actual juice/size and supported catalog modifiers | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 7. Catering | Event date/location/party; actual catering menu/package and scope; quote or supported booking | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |

## 11. Groceries And Essentials — 7 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses merchant + product as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Supermarket | Storefront aisle → actual item variants, pack/unit quantities; fulfillment | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Convenience Store | Storefront → actual available essentials; pack/unit quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Fresh Produce | Actual produce unit/weight; supported quantity and substitutions | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Butchery | Actual meat/cut/unit/weight; supported preparation and quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Seafood | Actual seafood unit/weight; supported preparation and quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 6. Organic Store | Actual product/pack; explicit organic classification rather than inferred label | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 7. Household Essentials | Actual household product/pack; explicit catalog grouping; quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |

## 12. Laundry And Cleaning — 5 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses provider + service as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Laundry | Garment/task unit or declared weight; pickup/return if supported | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 2. Dry Cleaning | Garment type/quantity; actual cleaning task; pickup/return | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 3. Ironing | Garment count/type and declared ironing scope; schedule | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 4. Home Cleaning | Address/service area; actual task scope/room units; supported schedule | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 5. Office Cleaning | Service address; actual office scope/units; supported schedule | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |

## 13. Health And Pharmacy — 9 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses product + care provider as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Pharmacy | Actual medicine/product/quantity; secure prescription input only when product policy requires | **RESTRICTED_PURCHASE** — Policy verification → cart → authoritative totals/payment → confirmed order |
| 2. Medical Supplies | Actual medical item/specification/size/quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Baby Products | Actual baby product size/pack/quantity | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Supplements | Actual supplement variant/pack/quantity; no inferred efficacy claims | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Hospitals & Clinics | Actual clinical service/provider/modality; supported slot; minimal private intake | **CARE** — Secure care configuration → policy/slot validation → appointment request/confirmation |
| 6. Telemedicine | Actual remote consultation/provider; supported slot/contact mode | **CARE** — Secure care configuration → policy/slot validation → appointment request/confirmation |
| 7. Mobile Diagnostic Services | Actual mobile diagnostic service/test; verified at-location service/collection area; supported slot; stated preparation | **CARE** — Secure care configuration → policy/slot validation → appointment request/confirmation |
| 8. Mental Health | Actual mental health service/provider/modality; supported slot; private intake boundary | **CARE** — Secure care configuration → policy/slot validation → appointment request/confirmation |
| 9. Therapy | Actual therapy service/provider/modality; supported slot; offering capability and private intake boundary | **CARE** — Secure care configuration → policy/slot validation → appointment request/confirmation |

## 14. Tech And Electronics — 8 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses product + merchant as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Smartphones | Actual phone model/storage/color/network variant; warranty/returns facts | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 2. Tech Accessories | Actual accessory; explicit compatible-device variant/specification | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 3. Computers | Actual computer configuration/storage/memory variant and warranty facts | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 4. Gaming | Actual console/game/accessory model/platform variant | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 5. Audio | Actual audio model/connectivity/color variant | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 6. Telecom Services | Actual telecom plan/service; supported activation/identity requirements; contract terms | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |
| 7. Smart Devices | Actual smart-device model/protocol/compatibility variant | **PURCHASE** — Cart → authoritative totals → supported payment → confirmed order |
| 8. Device Repairs | Device model; declared fault; actual repair scope; estimate/diagnostic terms | **SERVICE** — Service feasibility → fixed-price review or quote → request/booking → provider status |

## 15. Safaris And Tours — 5 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses offering + operator as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Safaris | Actual safari itinerary/departure; party; supported accommodation/inclusions | **TOUR** — Departure/capacity → terms and actual quote → booking/payment → operator status |
| 2. City Tours | Actual city-tour itinerary/session; party; meeting point | **TOUR** — Departure/capacity → terms and actual quote → booking/payment → operator status |
| 3. Cultural Tours | Actual cultural-tour itinerary/session; party; verified inclusions | **TOUR** — Departure/capacity → terms and actual quote → booking/payment → operator status |
| 4. Adventure Tours | Actual adventure offering/date; participants; provider-declared requirements | **TOUR** — Departure/capacity → terms and actual quote → booking/payment → operator status |
| 5. Travel Packages | Actual package/date/party; supported inclusions and booking or quote contract | **TOUR** — Departure/capacity → terms and actual quote → booking/payment → operator status |

## 16. Concierge Services — 10 subcategories

L2: [category blueprint](CATEGORY_BLUEPRINTS.md); one rail in the order below. L3 uses provider + service as contextual intent, retaining one common structure.

| Order / exact subcategory | L4 configuration candidates (require real capabilities) | Checkout journey / destination |
| --- | --- | --- |
| 1. Reservations | Desired venue/date/time/party and reservation preferences; request until confirmed | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 2. Personal Assistance | Actual assistance task/scope; date/location; supported preferences | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 3. Shopping Assistance | Shopping brief/items; date/location; budget only if provider supports it | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 4. Gift Sourcing | Gift brief/recipient/occasion/deadline; supported sourcing budget | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 5. Travel Planning | Travel brief/dates/party; actual planning scope; supported preferences | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 6. Property Coordination | Property task/scope/location/date; no unauthorized access credentials | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 7. Moving Assistance | Move origin/destination/date; inventory/scope and provider-supported requirements | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 8. Cleaning Coordination | Cleaning task/location/date/scope; coordination request distinct from direct cleaning | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 9. VIP Assistance | Actual VIP task/scope/date/location; supported needs without invented privileges | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |
| 10. Courier & Errands | Collection/destination/date; actual parcel/task scope and provider-supported restrictions | **REQUEST** — Submit request → provider review → actual quote → customer acceptance → task status |

## Taxonomy safeguards

Financial Services and Logistics & Shipping are not customer-facing main categories; preserve their original data and direct operational relationships. Vehicle Repair remains under Vehicle Rentals. Nested options do not increment the 98 count. The updated icon-authority V1.1 supersedes the previous 16/99 baseline and older V5/91/94 navigational groupings in presentation only; it does not rewrite merchant/source IDs or erase catalog history. New labels with no verified mapping remain valid navigation entries with truthful empty/capability states.
