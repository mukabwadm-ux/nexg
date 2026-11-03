# Product specifications, screens and workflows across all 21 categories

Date: 31 October 2026. Status: integrated design specification for review. This is the shared offering-information system across the complete current merchant taxonomy; Fashion & Apparel is one example.

Coverage: 21 categories, 128 subcategories, 189 specific offering types, 168 category/screen compositions and 1024 specialty/screen bindings.

[Structured screen/workflow JSON](all-screens-and-workflows.json) / [Full catalogue JSON](catalogue.json) / [Workflow information contracts](workflow-information.md) / [All offering fields](coverage-128.md)

## One product-kind system

Merchant identities suggest offering types. The selected actual product/service kind composes fields and customer screens; enabled owner capabilities choose supported workflows. No per-category backend or parallel state machine is introduced.

Template flow illustrations reuse registered model/schema contracts. Actual specialty offeringRoutes retain the historical or approved per-offering workflow references, intake modes and source guards. Do not replace a regulated, remote, greeting or other specialty route with a generic model illustration.

A merchant chooses an actual offering kind, enters its specific specifications and real options, and previews the corresponding customer view. The selected offering and enabled owner capabilities determine whether the customer buys an item, books time, reserves an asset/place, agrees production, enrolls in a plan or submits a request. The shared eight-screen portal adapts to those facts.

## Information through the journey

| Stage | Required behavior |
| --- | --- |
| Merchant captures the offering | Use the actual specific template and applicable typed fields; missing data remains unresolved. |
| Validate and publish | Apply the existing publication, source, policy and access gates. Category choice alone is insufficient. |
| Customer discovers and understands | Public projection includes the relevant specifications and no private/internal values. |
| Customer selects actual options | Retain actual variant and choice references, units, compatibility and specification overrides. |
| Owners check price and feasibility | The named independent owners revalidate actual quantities, resources, locations and price basis; unknown remains unknown. |
| Review terms and submit the selected command | Bind accepted specification/price/policy versions and purpose-limited private intake to the actual existing model workflow. |
| Execute the existing workflow | Use registered workflow transitions, owner guards and accurate independent allocation/payment/fulfilment/sync outcomes. |
| Complete or change accepted work | Completion, amendment, cancellation and any refund use their actual supported owners and preserve accepted historical facts. |

## Every merchant screen

| Screen | What changes for product-specific information |
| --- | --- |
| [Work](../screens/01-work.md) | Show the actual accepted offering and selected variants/options, quantity/unit and specification/price/policy versions. Render the existing selected workflow's permitted stages and commands. Private intake is restricted to its purpose and role; never show it in public product data. |
| [Offerings](../screens/02-offerings.md) | Choose the actual product/service kind, then compose the shared, type-specific and conditional input groups. Capture typed values, units, real variants, option compatibility, source and scope. Preview every customer destination before publishing through the existing owner gates. |
| [Availability](../screens/03-availability.md) | Show the applicable availability model for the selected offering: stock by variant/location, exact resource/interval, dated places, compatible spaces, paired windows, accepted workload, redemption or nonblocking request. Unit, time basis, source freshness and confirmation authority stay explicit. |
| [Business](../screens/04-business.md) | Maintain shared identity, permitted activities/locations, applicable policy/verification references and explicitly reusable specification defaults. Item and variant overrides retain their own scope/version. Business category suggests forms but does not describe or restrict the entire catalogue. |
| [Money](../screens/05-money.md) | Use the accepted actual item/variant/option, quantity/unit or interval and versioned price/charge terms. Distinguish starting estimates, quote-only, deposits, recurring consent and final total. Payment, refund, settlement and payout facts remain with their separate owners. |
| [Promotions](../screens/06-promotions.md) | Select actual eligible published offerings, variants, options, dates and locations. Use accurate specification highlights, correct media, price basis and applicable stock/capacity/policy eligibility. Promotion configuration cannot grant permission or invent availability. |
| [Insights](../screens/07-insights.md) | Report confirmed actual offering/type/variant, location, unit and selected workflow dimensions where evidence exists. Use existing metric definitions and declared source coverage. Catalogue attributes do not create clinical, financial or personal suitability conclusions. |
| [Settings](../screens/08-settings.md) | Configure source/edit authority per fact, typed field/import mappings, units and shared versions. Preserve scoped permissions, conflicts and privacy. The approved 21 additions are explicit design extensions; candidate metadata never silently activates live behavior. |

## Every customer surface

| Customer surface | Display and selection rule |
| --- | --- |
| Browse and search | Show actual product identity, accurate media, selected meaningful highlights and correctly labelled price/availability. Do not squeeze all specifications onto the card. |
| Offering detail and specifications | Group actual item-specific facts, inclusions and source-backed descriptors with labels/units. Missing, unknown and not-applicable states are distinct; private records and internal IDs are absent. |
| Variant, option and quantity selection | Offer real combinations and required/optional compatible choices. Selection updates the actual specification override, image, price and availability rather than silently substituting another item. |
| Size guide or fit information | Only where relevant, show the actual chart/fit meaning, selected row, units and measurement basis. Never invent a measurement or cross-system equivalence. |
| Price and charge breakdown | Show the selected price and actual unit/pack/quantity/period/person/quote basis, applicable extras and total. Starting estimates, deposits and unpriced requests retain their actual meaning. |
| Delivery, collection or service location | Show supported methods, exact location eligibility and authoritative estimates/promises. Unknown service coverage and freshness do not become a guaranteed delivery. |
| Date, time or capacity selection | Render only the actual selected model's supported schedule/interval/occurrence/paired-window behavior. Confirmation depends on source authority and all applicable constraints. |
| Terms and eligibility | Show applicable approved return/cancellation/deposit/usage/eligibility/renewal/provider terms before commitment. A seller answer does not establish verification or permission. |
| Private order, booking or enquiry input | Collect only necessary purpose-specific inputs and customer choices for this offering/model. Public form definitions and private responses remain distinct. Show pending versus accepted outcomes accurately. |
| Review and confirmation | Review the actual selected item/variant/options, quantity/unit or interval, accepted price and policy references before the owner command. Confirmation, allocation, payment, fulfilment and notifications remain separate outcomes. |
| Order, booking or request progress | Show the existing selected workflow's actual states and permitted customer actions from authoritative work. Quotes, requests, production, rentals, entitlements and provider handoffs do not become generic delivery orders. |

## Category-specific screen and workflow designs

| Category | Specialties | Specific offering types | Full screen coverage |
| --- | --- | --- | --- |
| [Adults Only](categories/adults_only-screens.md) | 6 | 8 | All eight merchant screens and applicable customer surfaces |
| [Airport Transfers](categories/airport_transfers-screens.md) | 4 | 3 | All eight merchant screens and applicable customer surfaces |
| [Alcohol & Beverages](categories/alcohol_beverages-screens.md) | 6 | 6 | All eight merchant screens and applicable customer surfaces |
| [Fashion & Apparel](categories/fashion_apparel-screens.md) | 7 | 28 | All eight merchant screens and applicable customer surfaces |
| [Beauty](categories/beauty-screens.md) | 5 | 9 | All eight merchant screens and applicable customer surfaces |
| [Vehicle Rentals](categories/vehicle_rentals-screens.md) | 5 | 4 | All eight merchant screens and applicable customer surfaces |
| [Experiences](categories/experiences-screens.md) | 9 | 11 | All eight merchant screens and applicable customer surfaces |
| [Financial Services](categories/financial_services-screens.md) | 7 | 7 | All eight merchant screens and applicable customer surfaces |
| [Flowers & Gifts](categories/flowers_gifts-screens.md) | 6 | 9 | All eight merchant screens and applicable customer surfaces |
| [Restaurants & Food](categories/restaurants_food-screens.md) | 8 | 14 | All eight merchant screens and applicable customer surfaces |
| [Groceries & Essentials](categories/groceries_essentials-screens.md) | 6 | 15 | All eight merchant screens and applicable customer surfaces |
| [Laundry & Cleaning](categories/laundry_cleaning-screens.md) | 5 | 6 | All eight merchant screens and applicable customer surfaces |
| [Marketplace](categories/marketplace-screens.md) | 9 | 34 | All eight merchant screens and applicable customer surfaces |
| [Pharmacy](categories/pharmacy-screens.md) | 4 | 10 | All eight merchant screens and applicable customer surfaces |
| [Health](categories/health-screens.md) | 5 | 7 | All eight merchant screens and applicable customer surfaces |
| [Tech & Electronics](categories/tech_electronics-screens.md) | 7 | 17 | All eight merchant screens and applicable customer surfaces |
| [Travel & Tours](categories/travel_tours-screens.md) | 7 | 6 | All eight merchant screens and applicable customer surfaces |
| [Vehicle Services](categories/vehicle_services-screens.md) | 5 | 11 | All eight merchant screens and applicable customer surfaces |
| [Wellness](categories/wellness-screens.md) | 4 | 9 | All eight merchant screens and applicable customer surfaces |
| [App Services](categories/concierge_services-screens.md) | 9 | 13 | All eight merchant screens and applicable customer surfaces |
| [Logistics & Shipping](categories/logistics_shipping-screens.md) | 4 | 4 | All eight merchant screens and applicable customer surfaces |

## Accepted work and changes

Accept the actual product/variant/options, quantity/unit or interval, content/chart version, applicable policy and pricing references. Catalogue specification, price, stock, resource availability, private intake and financial facts keep their respective owners. Accepted work keeps its historical specification and terms; editing the current listing cannot rewrite it.

Private customer measurements, addresses, recipient messages, patient administration, financial/provider documents and cargo declarations remain purpose-limited transaction data. Public customization/intake definitions are distinct from the responses they collect.

The 21 additional offering/model routes are approved for design inclusion and are explicit in approved-profile-additions.json. Actual setup, authority and implementation are still necessary. None of the design files activate an application workflow.

## Verification and limits

The verifier checks source identities, every offering's typed fields and customer destinations, all category/specialty screen bindings, workflow reference/transition preservation, approval composition and private/public boundaries. This is design evidence. Merchant validation, actual forms/persistence/API projection, real price/stock/allocation behavior and customer usability remain implementation evidence.
