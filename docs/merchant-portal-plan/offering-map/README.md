# Offering information map for all NEXG categories

Date: 31 October 2026. Status: complete current-baseline design mapping, proposed for merchant and customer review. No application implementation or runtime verification is claimed.

This package maps all 21 categories and 128 subcategories to 189 specific offering templates using 559 shared field definitions. There are 390 explicit specialty-to-offering mappings.

Start with a category below, open a subcategory, then follow an offering type to its full merchant-field and customer-display matrix. A merchant can use several templates and retain one business identity.

## Read the map

- [Product specifications: quick review of all 21 categories](product-specifications-review.md).
- [All 21 categories: screens and workflows](all-screens-and-workflows.md).
- [Workflow information contracts](workflow-information.md).
- [All 128 subcategories](coverage-128.md).
- [Field library and compound input shapes](field-library.md).
- [Customer display, variants and privacy](customer-display.md).
- [Decisions and approved additional activity routes](review-decisions.md).
- [Mapping scope and boundaries](plan.md).
- [Machine-readable catalogue](catalogue.json), [all-screen/workflow JSON](all-screens-and-workflows.json) and [verification evidence](verification.json).
- [Detailed Fashion example](fashion-review.md).

| Merchant category | Subcategories | Specific offering types |
| --- | --- | --- |
| [Adults Only](categories/adults_only.md) | 6 | 8 |
| [Airport Transfers](categories/airport_transfers.md) | 4 | 3 |
| [Alcohol & Beverages](categories/alcohol_beverages.md) | 6 | 6 |
| [Fashion & Apparel](categories/fashion_apparel.md) | 7 | 28 |
| [Beauty](categories/beauty.md) | 5 | 9 |
| [Vehicle Rentals](categories/vehicle_rentals.md) | 5 | 4 |
| [Experiences](categories/experiences.md) | 9 | 11 |
| [Financial Services](categories/financial_services.md) | 7 | 7 |
| [Flowers & Gifts](categories/flowers_gifts.md) | 6 | 9 |
| [Restaurants & Food](categories/restaurants_food.md) | 8 | 14 |
| [Groceries & Essentials](categories/groceries_essentials.md) | 6 | 15 |
| [Laundry & Cleaning](categories/laundry_cleaning.md) | 5 | 6 |
| [Marketplace](categories/marketplace.md) | 9 | 34 |
| [Pharmacy](categories/pharmacy.md) | 4 | 10 |
| [Health](categories/health.md) | 5 | 7 |
| [Tech & Electronics](categories/tech_electronics.md) | 7 | 17 |
| [Travel & Tours](categories/travel_tours.md) | 7 | 6 |
| [Vehicle Services](categories/vehicle_services.md) | 5 | 11 |
| [Wellness](categories/wellness.md) | 4 | 9 |
| [App Services](categories/concierge_services.md) | 9 | 13 |
| [Logistics & Shipping](categories/logistics_shipping.md) | 4 | 4 |

## Key distinctions

Merchant identity, offering type, variants, merchant shop sections and the actual operational workflow are separate. A dress uses size-specific measurements; a car rental uses vehicle and interval terms; an enquiry does not become a confirmed booking.

Publish/conditional/optional are proposed completeness requirements for review. A requirement applies only to the selected template and applicable field group. Unknown facts stay unknown. The curated offering list covers identified types across every current specialty and supports further reviewed types; it cannot enumerate every future merchant item.

The user approved 21 additional model routes for design inclusion. 0 additional routes remain unapproved. [Approved profile additions](approved-profile-additions.json) records the exact per-offering extension of the historical profile candidates. Real setup, policy, source authority and capacity are still required; no route is activated by this package.

## Sources and regeneration

The live TypeScript taxonomy supplies identities. The onboarding audit and reconciled question, profile, domain and model registries supply context. Source paths and hashes are in [manifest.json](manifest.json). Existing onboarding fields are referenced by their canonical question IDs rather than redefined as item facts.

Edit definitions.py or the category refinement in fashion.py, then run `python -X utf8 build.py` and `python -X utf8 verify.py` from this directory. approvals.json records the user's exact approved additions. Readable category/template pages and resolved JSON are generated views. The historical effective booking registries remain separate; the approved overlay is explicitly included in this design snapshot.
