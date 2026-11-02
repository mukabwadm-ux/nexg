# Product and service categorization plan

Date: 31 October 2026. Status: working proposal for discussion. Category examples below illustrate the model; they are not an approved taxonomy.

## Problem and intended outcome

A merchant's category and subcategory cannot describe everything the business offers. A salon can sell shampoo alongside hair appointments. A supermarket can sell groceries, cleaning supplies and flowers. Customers need to find those offerings even when they would not think to search for the merchant's business type.

NEXG should classify merchants and their offerings separately. Merchants should be able to organize a varied catalogue without creating another business account or changing their primary identity for each new line of business.

The clarified priority is capturing the specifications for each actual offering and displaying them usefully to customers. A dress needs its own fields and size-specific measurements; a shirt and a car rental need different fields. See the [offering information and customer display plan](offering-information-plan.md) for the working proposal. Classification helps choose the relevant form; it is only part of the solution.

The target users are merchants maintaining their catalogues, customers searching for something specific, and NEXG staff maintaining consistent platform categories.

## Existing NEXG baseline

The current [merchant taxonomy](../../packages/contracts/src/taxonomy.ts) defines 21 categories and 128 subcategories. The [onboarding audit](../audits/merchant-onboarding-audit-2026-10-29.md) records the current single-category, single-subcategory limitation. Some existing labels describe businesses, such as Liquor Stores; others describe offerings, such as Wine. We need a crosswalk before treating the current list as purely merchant identity.

The proposed [onboarding design](onboarding-and-configuration.md) already allows multiple activities. The [Offerings screen](screens/02-offerings.md) already covers products, services, assets, events, packages, imports and merchant sections. This proposal adds the classification rules those plans need. It does not replace the [reconciled booking configuration](payload-reserve-plan/reconciliation/README.md) or change its workflow rules.

## Separate the meanings

| Concept | Question it answers | Proposed rule |
| --- | --- | --- |
| Merchant identity | What kind of business is this? | Keep a primary identity and allow additional relevant activities. Use identity to suggest setup and describe the merchant. |
| Offering category | What is the customer buying, booking, renting or requesting? | Maintain a shared NEXG category hierarchy for offerings, independent of the merchant's identity. Give each published offering one primary category. |
| Offering attributes | Which specific qualities matter? | Store relevant structured details such as brand, size, hair type, dietary information or service duration. Use these for filters and variants. |
| Merchant sections and collections | How does this merchant arrange its shop? | Let merchants create names such as Breakfast, Hair care or Gift ideas. A section does not create a new platform category. |
| Operational configuration | How can the customer obtain this offering? | Configure its supported order, booking, rental or request workflow, fulfilment and location applicability. A discovery category does not establish stock, capacity or permission. |

An offering can appear in several collections and relevant search results while retaining one stable listing identity. It should not need duplicate listings just to appear in multiple places.

## Examples to test the model

| Merchant identity | Offering | Illustrative offering classification | Customer action |
| --- | --- | --- | --- |
| Salon | Hair colouring | Beauty services / Hair / Colouring | Book an appointment where configured |
| The same salon | Shampoo | Personal care products / Hair care / Shampoo | Buy a product |
| Supermarket | Fresh flowers | Flowers and gifts / Flowers / Bouquets | Buy a product |
| Bakery | Birthday cake | Food / Bakery / Cakes | Order with the applicable options and lead time |
| The same bakery | Event catering | Food services / Catering | Request a quote or place a configured catering order |
| Vehicle rental business | Self-drive vehicle rental | Rentals / Vehicles / Cars | Reserve a rental where configured |

These examples must keep different stock, resource, price and availability rules even when the offerings share one merchant profile.

## Merchant journey

1. During onboarding, ask what kind of business the merchant operates and which activities it actually offers. Suggest relevant offering groups without assuming that every suggested item exists.
2. Let the merchant add an offering, import a catalogue or use an explicitly supported connection. Large catalogues need bulk category assignment and reusable attribute defaults.
3. Suggest an offering category from the listing details and existing mappings. Let the merchant confirm or correct it. An ambiguous suggestion remains unresolved rather than silently becoming a published fact.
4. Show fields relevant to the offering and enabled activity. Adding shampoo to a salon requests product details; it does not reuse appointment capacity as product stock.
5. Let the merchant place the listing in its own sections or collections and select applicable branches. A branch-specific variant can have its own price, stock or service availability without duplicating the underlying identity unnecessarily.
6. Review applicable publication requirements. A new line of business can need additional setup before its offerings become available to customers.

A merchant should not have to enter its entire catalogue to describe its business. The exact minimum needed for publication remains governed by the applicable readiness policy. A merchant-declared offering group describes its range; it must not appear as a specific item in stock or an available appointment.

## Customer discovery

Customers should be able to search for an offering, browse offering categories, or browse merchants by business type. A search for shampoo can find an eligible salon product listing. A search for salons can find salon businesses. Product results, service results and merchant results need clear labels and appropriate actions.

Use the published offering classifications to identify which merchants carry a category at each applicable location. Keep availability separate: carries shampoo, shampoo in stock, and shampoo deliverable to this customer are different claims. A service can be listed while its next appointment is unavailable.

Search aliases can connect customer wording to the same category. Attributes support filters. Merchants' promotional collection names should not determine the shared search classification. Cross-category bundles need explicit contents and compatible fulfilment rather than duplicate product records.

## Rules for maintaining the categories

- NEXG maintains shared category IDs, names, definitions, parent relationships and aliases. Merchants maintain their own listing content and shop sections.
- Use as much hierarchy as customers need to browse meaningfully. Keep brand, size, colour and similar variations in attributes rather than multiplying category branches.
- Allow offerings across business categories when the actual activity and its requirements are configured. Primary identity alone must not exclude a relevant offering.
- Provide a category request and mapping-review path when an offering does not fit. Imported records can remain drafts while unresolved classifications are reviewed.
- Preserve stable merchant and offering IDs during reclassification. Record mappings and changes, and keep accepted order and booking history intact.

## Work sequence

1. Audit the existing 128 subcategory labels. Mark each meaning as a business identity, offering group, activity or attribute, and record labels that mix meanings. Preserve existing IDs through an explicit crosswalk.
2. Use real or merchant-validated sample catalogues to identify the offering categories and attributes needed. Include a broad retailer, a specialist seller and businesses combining products with services.
3. Draft the offering hierarchy, definitions, synonyms and crosswalk. Map each sample listing and record gaps, ambiguous cases, bundles and location differences.
4. Design onboarding, individual listing, bulk import and customer discovery journeys against the same model. Keep offering fields and workflows aligned with the existing portal and booking plans.
5. Define the implementation contracts, migration approach and acceptance evidence after the classification decisions are reviewed. This working proposal does not yet select a database schema or supply a complete category list.

## How we will assess the plan

The review should establish whether merchants can describe their actual range, whether customers can find it, and whether classification creates unnecessary work.

Record the proportion of sample offerings that fit an agreed category, ambiguous or missing mappings, time and corrections needed to classify a catalogue, and customer success on agreed search tasks. Set numeric targets after measuring the sample baseline.

Required scenarios include finding a salon's shampoo through product search, keeping its appointment booking separate, assigning categories to a large import in bulk, preserving a custom shop section, and showing different availability across branches. Reclassification must preserve historical references. Unknown stock or capacity must remain unknown.

The [all-category offering information map](offering-map/README.md) now supplies the specific offering types, field matrices and customer-display destinations across all current specialties. A final platform offering hierarchy and merchant validation remain separate decisions; the existing merchant identities are preserved.
