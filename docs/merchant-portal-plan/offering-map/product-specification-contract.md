# Product-kind specification and presentation contract

Date: 31 October 2026. Status: design specification across all 21 current merchant categories and 128 subcategories. This defines the offering-information system; Fashion & Apparel is one detailed example.

## What determines the fields

Merchant identity describes the business. The actual offering kind selects the specification template. A merchant can have several relevant kinds without another account or a new primary category. Capability, policy and publication requirements still apply to the actual activity.

Examples include a dress, shirt, dairy product, charger, laptop, rental vehicle, transfer, ready-made cake, custom cake, lab service and freight service. Each references its own field groups and customer/action mappings. A broad store category, free-text description or tag cannot supply missing item facts.

The [catalogue JSON](catalogue.json) holds the resolved typed field library and offering templates. The [screen/workflow JSON](all-screens-and-workflows.json) composes those definitions into all eight merchant screens, eleven customer surfaces and the actual existing workflow bindings. The [all-category review](product-specifications-review.md) provides concrete examples and links to every full matrix.

## Specification composition

An actual offering combines shared listing content, applicable product-kind groups, conditional groups, real variants/options, location applicability, price/stock/source references and the supported operational model. Definitions have stable registry symbols; actual merchant/offer/variant/resource records retain their own opaque entity IDs.

Each field specifies its meaning, input/value shape, applicable condition, proposed completeness requirement, unit where relevant, scope, owner reference, source/editability and customer destination. Shared meanings are referenced rather than independently redefined. Requirements are reviewed design inputs; a draft does not require invented facts.

Compound controls contain named typed members. Dimensions retain separate length/width/height/mass and units. Capacity separates people, bags, pieces or actual service units. Price keeps currency and unit/basis. Power profiles keep per-port and combined ratings distinct. Customer choices retain actual compatibility and quantities. A merchant-specific extension needs a named type/unit/scope/visibility and does not automatically become a shared search filter.

## Variants, charts and nested controls

Variants are actual purchasable combinations with stable identities. They can override the relevant media, specifications, price and availability reference. The system must not create every possible size/colour/configuration combination or silently substitute an unavailable choice.

The guide's chart reference, chart rows and measurement columns compose one control. Capture an actual measurement once, with its unit, meaning and size/variant/piece scope. A versioned shared chart is a reusable reference; an explicit item/variant override is a scoped exception. These are not several independently editable copies of the same fact.

The same principle applies outside clothing. A laptop configuration, vehicle capacity, food pack quantity, tyre fitment, cargo-piece measurement or storage unit has explicit values and constraints. Specifications can vary by actual option or location, while the underlying offering identity remains stable.

Unknown, not applicable, zero and false remain distinct. No size, dosage, compatibility, legal eligibility, charge rule, supplier availability or medical/financial claim is invented from a name or category.

## Customer projection

Every noninternal field has a declared destination. Brief identity/price/highlights appear on cards. Detailed facts and inclusions appear on the offering page. Actual variants/options, applicable guides, pricing, fulfilment, scheduling and terms have their own appropriate sections. The selected variant/option consistently updates the relevant source-backed facts.

Private responses are separate from public form definitions. Personal measurements, addresses, recipient messages, health administration, provider application documents and cargo declarations stay in authorized transaction intake. Internal identifiers, control modes, raw evidence and resource master records remain internal.

## Workflow and accepted work

The actual offering and enabled model determine whether the customer orders stock, books time, reserves an asset/place, agrees custom production, enrolls in a plan, or submits a quote/enquiry. Existing state machines and their guards remain authoritative. The integration adds the actual specification/selection and accepted-version references to their information contract; it does not create 21 separate engines or a new generic order lifecycle.

Before accepting a transaction, the respective owners recheck the actual selected variant/options, quantity/unit or interval, price, policy, location and capacity/stock. A current availability result, payment result or form submission is not a substitute for the selected workflow's confirmed outcome.

Accepted work binds the actual specification/variant/options and relevant chart/policy/price versions. Private input is restricted to its actual purpose. A later catalogue, chart, current-price or policy edit does not rewrite accepted work. Changes, substitutions, reschedules, cancellations and refunds use their authorized existing owner paths.

## All screens and change control

The [21 category compositions](all-screens-and-workflows.md) list the actual relevant field references for Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings, plus every applicable customer surface. All 128 subcategories have explicit screen and offering-route bindings.

The 21 separately reviewed additional offering/model routes are [approved for design inclusion](approved-profile-additions.json). This is distinct from the count of 21 merchant categories. Their exact approval is composed with the preserved baseline; adding a new type or activity outside that scope does not silently inherit approval.

The current assignment updates JSON and design/specification documents, as requested. Future application implementation must carry the information through entry, validation, persistence, public projection, selection, owner commands and historical snapshots, with source, privacy and recovery behavior verified together.
