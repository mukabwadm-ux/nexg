# Decisions for review

All design mappings are present. These decisions remain review inputs rather than runtime promises.

## D01: Mandatory publication fields

Status: FOR_REVIEW.

The published/conditional/optional labels are proposed completeness requirements. Validate them with representative merchants and the existing readiness policy owner before runtime enforcement.

## D02: Missing size and measurement data

Status: FOR_REVIEW.

Preserve unknown values and allow drafts. Do not infer measurements from M/L or cross-system size conversion. Review whether a specific item may publish with a visible incomplete size guide or must complete it first.

## D03: Offering hierarchy and further types

Status: FOR_REVIEW.

The named types are a curated initial catalogue across every current specialty, not every conceivable future SKU. Add a specific template or reviewed typed extension when the actual item needs different fields.

## D04: Shared charts and policies

Status: FOR_REVIEW.

Pin versions and show affected listings before applying a shared update. Choose explicit item/variant/location overrides and preserve accepted historical facts.

## D05: Additional business activities

Status: RESOLVED_INCLUSION_APPROVED.

The user approved all 21 listed additions for design inclusion on 31 October 2026. They are compiled as approved per-offering profile extensions; runtime setup, authority, policy and capacity requirements remain applicable.

## D06: Regulated content and sensitive intake

Status: FOR_REVIEW.

Use approved provider/manufacturer information and policy/verification owners for pharmacy, health, financial and restricted goods. Define exact applicable requirements during implementation without inventing thresholds or claims in the mapping.

## D07: Import and legacy compatibility

Status: FOR_REVIEW.

Map source attributes and preserve IDs, relationships and private values. Missing fields stay unresolved; legacy descriptions cannot reliably supply measurements, compatibility, clinical or financial facts.

## D08: Pricing and money migration

Status: FOR_REVIEW.

The existing catalogue uses whole-KES fields while the NEXG contract summary calls for minor units and currency. Resolve the owner-approved mapping and rounding explicitly before any migration; this package performs none.

## D09: Customer and merchant validation

Status: FOR_REVIEW.

Review real sample listings and task completion across every family. Automated coverage establishes mapping/reference consistency only, not correct provider terms, successful shopping or a working portal.

## Approved additional activity routes

The user approved these 21 exact template/model additions for design inclusion. The historical profile snapshot is preserved, and approved-profile-additions.json records its explicit per-offering extension. Actual customer actions still depend on the selected offering, implementation and confirmed owner prerequisites.

| Subcategory | Offering template | Model | Inclusion status |
| --- | --- | --- | --- |
| Festivals / `festivals` | [Class or activity pass](templates/session_pass.md) | ENTITLEMENT | Approved for design inclusion |
| Conferences / `conferences` | [Venue or space reservation](templates/event_space.md) | SPACE_RESERVATION | Approved for design inclusion |
| Private Events / `private_events` | [Venue or space reservation](templates/event_space.md) | SPACE_RESERVATION | Approved for design inclusion |
| Private Events / `private_events` | [Photography shoot package](templates/photography.md) | APPOINTMENT | Approved for design inclusion |
| Private Events / `private_events` | [Photography shoot package](templates/photography.md) | FIELD_VISIT | Approved for design inclusion |
| Workshops / `workshops` | [Class or activity pass](templates/session_pass.md) | ENTITLEMENT | Approved for design inclusion |
| Recreation / `recreation` | [Class or activity pass](templates/session_pass.md) | ENTITLEMENT | Approved for design inclusion |
| Cakes / `cakes` | [Ready-made cake or cake slice](templates/ready_cake.md) | ORDER | Approved for design inclusion |
| Restaurant / `restaurant` | [Catering service or event menu](templates/catering.md) | REQUEST_QUOTE | Approved for design inclusion |
| Stationery / `stationery` | [Personalized gift or printed item](templates/personalized_gift.md) | PRODUCTION_DUE | Approved for design inclusion |
| Coaching / `coaching` | [Class or activity pass](templates/session_pass.md) | ENTITLEMENT | Approved for design inclusion |
| Travel Packages / `travel_packages` | [Overnight safari itinerary](templates/safari.md) | TOUR | Approved for design inclusion |
| Travel Packages / `travel_packages` | [City or cultural tour](templates/city_tour.md) | TOUR | Approved for design inclusion |
| Tire Service / `tire_service` | [Tyre product](templates/tire_product.md) | ORDER | Approved for design inclusion |
| Battery Service / `battery_service` | [Vehicle battery product](templates/battery_product.md) | ORDER | Approved for design inclusion |
| Spa / `spa` | [General personal-care product](templates/personal_care.md) | ORDER | Approved for design inclusion |
| Massage / `massage` | [General personal-care product](templates/personal_care.md) | ORDER | Approved for design inclusion |
| Gym / `gym` | [Individual personal-training session](templates/training.md) | FIELD_VISIT | Approved for design inclusion |
| Gym / `gym` | [Dated class place](templates/class.md) | SESSION_CAPACITY | Approved for design inclusion |
| Personal Training / `personal_training` | [Class or activity pass](templates/session_pass.md) | ENTITLEMENT | Approved for design inclusion |
| Moving Assistance / `moving_assistance` | [Road freight or truck-load service](templates/road_freight.md) | FREIGHT | Approved for design inclusion |
