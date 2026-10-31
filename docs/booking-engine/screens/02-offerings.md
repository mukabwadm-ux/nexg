# Offerings

Screen ID: SC_OFFERINGS. Status: proposed design. Planned after Work. Inherits the shared screen contract.

## Purpose and boundaries

Create, import, organize and maintain what customers can discover, buy, book or request. Offerings owns listing content and references the authoritative price, inventory, resource, availability and publication contracts. It does not confirm a booking, change ledger balances or override external stock ownership.

The navigation remains Offerings. The page heading can be 'Your menu', 'Products', 'Services', 'Vehicles', 'Events' or a combined 'Offerings' according to configured capabilities. Hybrid merchants get separate type views without pretending an appointment service is a stock item.

## Layout

Header contains location/capability scope, Add and Import/Connect where permitted. Views are All, Drafts, Published and Needs attention with source-accurate counts. Use a table for operational catalogues and an optional image view where recognition benefits from photos. The default table shows name, type, schema-relevant price basis, publication, operational availability and source. A photo is optional rather than a mandatory oversized card.

The editor groups Basics, Options and pricing, Fulfilment, Availability/resource links, Customer presentation and Review. Relevant tabs appear from schema and capability. Show the preview alongside on desktop and through a labelled Preview action on mobile. Keep publication blockers close to Publish.

## Feature inventory

| ID | Feature/data | Interaction and outcome |
| --- | --- | --- |
| OF01 | Offering catalogue by configured type | List normalized offering summaries, scope and source. Preserve filters and selected item on return. |
| OF02 | Search, filters, sorting and saved view | Filter type, category, section, source, publication, availability and real blockers. Distinguish unconfigured, empty and filtered empty. |
| OF03 | Add offering | Choose from enabled schemas; create stable draft identity. A merchant with one type goes directly to its editor. |
| OF04 | Import/connect catalogue | Select supported source and import mode; map fields/IDs, preview validation and duplicates, confirm a non-destructive merge. |
| OF05 | Identity and content | Name, description, appropriate media, sections/tags and customer-visible descriptors. Enforce schema and accessible media text. |
| OF06 | Schema-specific fields | Render declared product/service/asset/event/package attributes with typed controls, dependencies, help and validation. Unknown external fields go to mapping review. |
| OF07 | Variants and option groups | Sizes, models, extras or service options with compatibility, price effects and availability source. Validate combinations and define customer choice constraints. |
| OF08 | Units and quantity rules | Count/weight/volume/area/time/person/session with explicit unit, precision, minimum and maximum where needed. Never assume one quantity means one item. |
| OF09 | Pricing | Fixed, unit, time/rental period, package, permitted starting price or quote-only. Explicit currency and authoritative rounding rule. No price is not zero. |
| OF10 | Stock and external ownership | Show source quantity/reservation/stock state where authorized. Adjustment opens the owner's supported command or explains externally managed data. |
| OF11 | Duration and resource eligibility | Exact appointment duration/buffers, compatible staff/assets/locations and capacity source. Availability owns the calendar and reservation logic. |
| OF12 | Rental asset details | Vehicle/asset identity, class, relevant specifications, supported options and applicable terms references; link asset-specific dates and condition records. |
| OF13 | Event/session offering | Event description, dated session references, capacity/price basis and ticket-issuer relation. Creating a listing does not issue a ticket. |
| OF14 | Package/bundle composition | Reference constituent offerings, required options, fulfilment compatibility and pricing authority. Prevent circular packages and unavailable constituents being hidden. |
| OF15 | Fulfilment methods | Per-offering delivery/collection/visit/remote/return methods, locations, instructions and constraints inherited from configuration. |
| OF16 | Policies and eligibility | Applicable age/document/booking/cancellation/deposit/return references. Verified status comes from its owner, not seller-written copy. |
| OF17 | Schedule and visibility | Publish windows, location applicability and discovery intent; link Availability for actual service windows/capacity. |
| OF18 | Customer preview | Preview browse/order/book/request/quote interaction with accurate labels, units and timing. Identify preview data and any unverified claim. |
| OF19 | Save draft and validate | Preserve stable IDs and field provenance. Validate required current fields; show field errors and linked summary. |
| OF20 | Submit/publish/unpublish | Check owner publication gates and preview customer impact. Pending review remains pending. Unpublish stops new discovery as defined without erasing existing work. |
| OF21 | Operationally unavailable/available | Use availability owner's supported action; distinguish sold out, no slots, paused listing and unpublished. Do not toggle externally owned state locally. |
| OF22 | Duplicate/archive/restore | Duplicate only permitted editable content; new ID and draft state. Archive preserves historical references. Restore revalidates current requirements. |
| OF23 | Bulk changes and organization | Select eligible records, preview field/scope/source restrictions, apply revision-aware commands and report each result. Reordering is not a price or stock mutation. |
| OF24 | Change history and conflict review | Field-level source, actor/time, versions and current authoritative value. Offer an informed retry without overwriting a newer edit. |
| OF25 | Export and channel projection | Export authorized content with units/currency and mappings; show where the listing is visible. Failure on one channel does not falsely report universal publication. |

## Domain-specific schemas

Product fields include meaningful SKU/external ID, variant, unit and stock relationships. Food can add modifiers, dietary descriptors and actual preparation rules. Medical/regulated products use approved eligibility/document references without clinical records or invented authorizations.

Services define exact duration or a quote/request model, service-location choices and compatible resources. Rental listings distinguish asset class from a specific bookable asset and preserve rental units/terms. Transfers define service coverage and passenger/vehicle constraints. Freight services express dimensional and shipment intake schemas rather than a fixed per-item checkout. Warehouse offerings describe storage service/unit and capacity references. Financial categories expose approved service information/enquiry forms and provider handoff; enabling 'payments' in taxonomy does not grant transaction authority.

Schema extensions are declared in the category/capability manifest. A future category reusing a service schema gains the editor with its own fields. A novel interaction needs an implemented specialist component before publication.

## State model and recovery

All reads inherit R01–R12 and writes A01–A10. Domain state is independently represented for draft/review/publication, operational availability and source sync. A published service can have no available slots; a stocked product can be unpublished. An external change can be pending even while the last confirmed listing remains visible.

Import stages: choose source → map → validate → preview changes → confirm → processing → completed/partial/failed. Preserve external references and existing stable offering IDs. Never delete a merchant's catalogue to save the current form. Retry failures by operation/result, not by repeating an already applied batch. Invalid rows remain inspectable; partial success gives a downloadable permitted error report.

Changing a duration or policy previews future bookings affected and uses the owner's migration rule. Existing accepted prices and terms remain historical facts. Closing a dirty editor asks only about real unsaved changes; drafts survive interruptions under the retention policy.

## Journeys and cross-screen effects

1. **Rental asset:** add vehicle/class → define applicable fields and rate basis → link resource/availability → preview → pass readiness → publish. Work reservations reference the published version; Availability receives the resource link.
2. **Appointment plus product:** add service with duration/staff eligibility; add product through product schema. Shared business identity is reused; stock is not used as service capacity.
3. **External catalogue:** connect/match IDs → inspect mapped price/stock ownership → preview merge → confirm → view source-managed fields. A stale feed shows freshness and the actual permitted selling behaviour, never guessed stock.
4. **Quote-only freight:** configure service and required dimensions/route fields → preview a request CTA → publish where authorized. No invented fixed checkout price appears.

Confirmed content/publication changes refresh discovery and Home summaries. Price/stock/resource changes notify the relevant owners and reports through their contracts. A promotion revalidates referenced listings; it does not silently rewrite catalogue prices.

## Mobile and UX rationale

Mobile catalogue preserves name, meaningful price basis and the two distinct status labels. The editor is a full-page grouped form with an explicit save state and review step. Retain essential attributes instead of squeezing every desktop column into tiny text.

Recognition supports familiar offering nouns and previews. Common region groups price, unit and quantity constraints. Progressive disclosure follows offering type while publication blockers remain visible. Error proximity reduces correction effort. Familiar form controls and readable density carry more value than decorative imagery.

## Acceptance scenarios

- OF-T01: a rental offering displays vehicle-specific fields and period pricing; changing to chauffeur option requests the applicable resource data without creating a transfer capability.
- OF-T02: external-owned price/stock remain read-only locally; supported remote edit stays pending until source confirmation.
- OF-T03: import preserves IDs, shows duplicate mapping and handles partial failure without erasing existing offerings.
- OF-T04: quote-based service publishes a request form with required dimensions and units, with no zero-price claim.
- OF-T05: appointment duration update shows affected future work and leaves accepted historical terms intact.
- OF-T06: new-category manifest reusing an offering schema renders its registered fields and rejects unresolved component references.

Apply all 128 profiles and inherited state cases, including permissions, filtered-empty and unknown-outcome recovery.
