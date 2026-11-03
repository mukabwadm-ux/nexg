# Offering information and customer display plan

Date: 31 October 2026. Status: working proposal for discussion. Field examples are draft requirements to validate with merchants and customer journeys.

The [all-category offering information map](offering-map/README.md) now expands this proposal across every current category and subcategory. The clarified scope is the complete product-kind system: [specific product information](offering-map/product-specifications-review.md), [all affected screen designs and workflows](offering-map/all-screens-and-workflows.md) and [structured bindings](offering-map/all-screens-and-workflows.json). Fashion is one example. Publication requirements remain proposed for review.

## The problem we need to solve

When a merchant enters an offering, NEXG needs to capture the specific information a customer needs to understand it, choose the right option and complete the appropriate purchase, booking or request. A name, short description and price cannot carry that information consistently.

Merchant categories describe the business. Offering categories help classify its catalogue. Neither replaces the detailed information for the actual item. Even Clothing is too broad to determine a complete form: a shirt, dress and pair of shoes need different specifications. Some specifications also differ between variants of the same item.

The central design task is to define each offering's customer page and selection journey, then work backwards to the merchant fields, validation, storage and display needed to support them. The [categorization proposal](offering-categorization-plan.md) supplies the classification context.

## What exists today

The current [onboarding catalogue entry](../../apps/web/components/onboarding/step-payout.tsx), [public catalogue contract](../../packages/contracts/src/api.ts) and [customer catalogue component](../../apps/web/components/explore/catalogue.tsx) primarily carry basic listing information and status flags. They do not provide a complete structured specification and variant model for the examples in this plan.

The existing [Offerings screen proposal](screens/02-offerings.md) names schema-specific fields and variants. This document expands that requirement into information capture and customer presentation. It remains planning work and preserves the [effective booking configuration](payload-reserve-plan/reconciliation/README.md).

## How the entry form should adapt

| Source of fields | Purpose | Example |
| --- | --- | --- |
| Shared offering details | Common information appropriate to the offering | Name, description, media, category, location applicability and price basis |
| Offering family | Reusable information across related items | Apparel material, fit, size system and care instructions |
| Specific offering type | Information needed for this particular kind of item | Dress bust/waist/hip measurements, length and lining; vehicle seats, transmission and rental inclusions |
| Conditional answers | Reveal only the applicable follow-up questions | Size options enable a measurement chart; a mileage limit enables the allowance, period and excess-distance charge |
| Variant and location details | Record facts that differ between purchasable choices or branches | A blue size M dress has its own measurements and stock; a rental vehicle has location-specific availability |
| Merchant defaults and additional details | Reuse shared policies and support relevant facts beyond the standard template | A saved size chart, shared return policy or a labelled specialist product detail |

The merchant chooses what they are adding. NEXG can suggest the type from the business and listing details, but the merchant can correct it. A merchant can use several offering types under one business account.

Templates should reuse field groups without forcing every item into one generic form. Customer display, validation and imports must use the same field meanings. A merchant's custom text field must not silently become a standard platform filter.

## Worked example: a dress

The merchant selects Clothing, then Dresses. NEXG asks for the relevant shared apparel information and dress-specific details. The draft below distinguishes information to consider from final mandatory publication requirements.

| Information to capture | Scope and entry behavior | What the customer receives |
| --- | --- | --- |
| Name, photos and description | Listing-level content; photos can be associated with the actual colour variant | Product title, gallery and description |
| Brand and style | Structured fields where relevant | Brand and recognizable style details |
| Fabric and composition | Named materials and known proportions, with care instructions | Material and care section |
| Stretch, lining and transparency | Explicit applicable values; an unanswered question is not No | Details that help assess comfort, coverage and fit |
| Silhouette, neckline, sleeves, closure and dress length | Relevant dress attributes; use labelled choices and applicable units | Dress specifications and useful filters |
| Available sizes and size system | Merchant's actual sizes, with a named system where applicable; do not assume all M or UK 12 labels are equivalent | Size selector and clear sizing reference |
| Bust, waist, hips and length by size | A reusable or item-specific measurement chart with explicit units and measurement basis; record only applicable measurements | Size guide with a row for each actual size |
| Fit guidance | Explain whether measurements describe the garment or the intended wearer's body; state how to measure | Clear fit guidance beside the size selector |
| Colours and valid combinations | Define real combinations instead of assuming every size exists in every colour | Customer can select only actual variants |
| Price and stock by variant | Each valid combination references its correct price and availability | Selected option updates price and availability |
| Returns, alterations or made-to-measure options | Reference applicable merchant policies; show extra fields only if the service is offered | Relevant terms and customization choices before commitment |

For a dress offered in S, M and L, a single listing-level waist value is insufficient. Each size needs its own applicable measurement values or an explicit reference to a size chart that accurately describes it. A selected size should identify the corresponding size-guide row.

Garment measurements and recommended body measurements are different facts. The chart must label which it contains and whether values represent a circumference or a flat width. Conversion between centimetres and inches must preserve that meaning. Unknown measurements must remain unknown; NEXG should not invent a universal size conversion or generate measurements from a size label.

Some dresses have an elastic waist, adjustable straps or a loose silhouette. Their template can express a measured range or mark a measurement as not applicable with a reason. It should not demand a misleading single number for every design.

If a merchant offers custom tailoring, the customer's personal measurements belong to the private order or service intake. They are separate from the public product's size chart.

## Why a shirt and car rental need different templates

| Offering | Relevant information beyond the shared details | Customer presentation and selection |
| --- | --- | --- |
| Shirt | Fabric, fit, collar, sleeve style, size system, applicable chest/shoulder/sleeve/length measurements, colours, care, variant prices and stock | Gallery, specifications, size guide, valid colour/size choices, selected price and availability |
| Car rental | Exact vehicle or clearly labelled vehicle class, make/model where promised, seats, luggage capacity, transmission, fuel/power type, air conditioning, rental price basis, duration rules, mileage policy, fuel policy, deposit, applicable cover and exclusions, pickup/return arrangements and optional driver | Vehicle details, inclusions and terms, dates and location choices, supported extras and a price breakdown for the actual rental selection |

A specific guaranteed rental vehicle is different from a vehicle class offered as or similar. Likewise, a daily rental rate is different from the total for selected dates and extras. The template and customer page must preserve those distinctions.

Rental eligibility and policy fields describe the merchant's applicable terms; this proposal does not invent platform-wide thresholds or coverage promises. Registration identifiers and operational notes need explicit visibility decisions. Customer documents belong to the authorized booking intake rather than the public listing specifications.

## Define every field through to its use

For each template field, specify:

- Its stable meaning, merchant-facing label, help and input type.
- Whether it belongs to the merchant, listing, variant, branch, resource or individual order/booking.
- Its unit, allowed values and rules for missing, unknown and not applicable values.
- When it appears and when it is required for saving, publishing or a later transaction.
- Its source and whether the merchant can edit it or explicitly override a shared default.
- Whether it is public, restricted or internal, and its destination in the customer experience.
- Whether it supports search, filtering, comparison, option selection, pricing or operational validation.

Customer destinations include the browse-card summary, detail-page specifications, size guide, options, pricing breakdown, fulfilment information and applicable terms. Some fields are customer inputs at transaction time. Others are private operational records. Capturing a field does not imply publishing it.

Do not put essential selection, price or policy information only in a free-text description. Additional descriptions can explain the structured facts. A meaningful field without a defined display or operational purpose needs review before adding form work for merchants.

## Entry, preview and maintenance journey

1. Choose the specific offering type and load the relevant template.
2. Enter shared information, then grouped type-specific details. Save drafts without demanding every publication field immediately.
3. Add actual variants, measurements, options and their applicable prices, stock or availability references. Reuse accurate charts and defaults with explicit scope.
4. Preview the customer card, detail page and selection journey using the entered information. Missing details and unclear units should be visible in the review.
5. Resolve applicable publication gaps, then publish through the existing readiness and activity requirements.
6. Maintain details through individual edits, bulk changes or supported imports. Preserve existing IDs, variant relationships and source ownership.

Changing an offering type must review incompatible fields and explain what can be reused. Old fields must not leak into the new customer display. Changes to shared size charts or policies need an impact preview and clear version behavior. Existing accepted orders and bookings keep the specifications, selected options, prices and terms that applied to them.

Custom details need labelled, typed values with units and visibility. Repeated merchant requests for the same missing detail should inform a shared template update. Imports need mappings for specifications, charts and variants, with unresolved values available for correction rather than discarded.

## Work sequence and acceptance

1. Define the customer card, detail page and selection journey for a dress, a shirt and a car rental. Use actual merchant examples or clearly labelled illustrative data.
2. Create a field matrix for each example, covering meaning, scope, type, required conditions, units, source, visibility and customer destination.
3. Define the reusable field groups and the rules that compose a specific offering template. Map the offering types needed across the current 128 merchant subcategories; do not assume one template per merchant subcategory.
4. Audit the entry forms, persistence, public reads, customer display and transaction handoff against those matrices. Record the gaps throughout the path, including import and migration needs.
5. Implement the reviewed templates and verify real entry-to-customer journeys before extending coverage to further offering types.

Acceptance must demonstrate that a dress's size M and L show the correct distinct measurements, units and valid colour combinations; changing a variant updates its actual price and availability; a shirt receives relevant shirt fields; a rental displays its own specifications, date-dependent pricing and terms; and one merchant can maintain different offering types. Private fields must remain private and unknown information must not become invented values.

The [all-category map](offering-map/README.md) supplies the field matrices and customer-display rules across all current specialties, including the dress, shirt and car rental examples. Merchant validation and actual interface implementation remain future work.
