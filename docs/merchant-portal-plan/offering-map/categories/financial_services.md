# Financial Services

Status: proposed offering and field mapping. Each type is a selectable template, not a statement that every merchant offers it.

[All categories](../README.md) / [All screens and workflows for this category](financial_services-screens.md) / [Coverage](../coverage-128.md) / [Review decisions](../review-decisions.md)

## Banking

Existing identity: `banking`. Effective profile: `MP_banking`.

Provider-approved account/service information and private appointment/enquiry intake; no account opening, credit or fund movement is implied.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_FIN_SERVICES_OFFERED_BANK`, `Q_PHYSICAL_LOCATIONS_COUNT`, `Q_DIGITAL_PLATFORM`, `Q_OPERATING_HOURS_TEXT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Banking service enquiry or appointment](../templates/banking_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Provider and service identity, Supported service or product types; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Forex

Existing identity: `forex`. Effective profile: `MP_forex`.

Capture supported currency pairs, locations, provider fee/rate source and validity; indicative information is distinct from an executable quote.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_CURRENCIES_TRADED`, `Q_PHYSICAL_LOCATIONS_COUNT`, `Q_DIGITAL_PLATFORM`, `Q_OPERATING_HOURS_TEXT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Currency exchange enquiry or provider handoff](../templates/forex_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Supported service or product types, Locations, currencies or corridor limits; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Insurance

Existing identity: `insurance`. Effective profile: `MP_insurance`.

Capture cover category, provider, approved scope/exclusions and quote/application handoff; listing a policy does not bind cover.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_INSURANCE_TYPES`, `Q_PHYSICAL_LOCATIONS_COUNT`, `Q_DIGITAL_PLATFORM`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Insurance information or quote request](../templates/insurance_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Provider and service identity, Supported service or product types; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Payments

Existing identity: `payments`. Effective profile: `MP_payments`.

Show supported provider channels, applicable terms and activation/handoff scope; payment transaction authority stays with its owner.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_PAYMENT_CHANNELS`, `Q_DIGITAL_PLATFORM`, `Q_PHYSICAL_LOCATIONS_COUNT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Payment service information or provider handoff](../templates/payment_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Supported service or product types; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Remittance

Existing identity: `remittance`. Effective profile: `MP_remittance`.

Capture actual corridors/currencies, provider-approved fees/timing basis and private provider handoff; no invented delivery guarantee.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_REMITTANCE_CORRIDORS`, `Q_DIGITAL_PLATFORM`, `Q_PHYSICAL_LOCATIONS_COUNT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Remittance service enquiry or provider handoff](../templates/remittance_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Locations, currencies or corridor limits; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Sacco Services

Existing identity: `sacco_services`. Effective profile: `MP_sacco_services`.

Describe membership and actual service eligibility through provider terms; a catalog listing is not a membership acceptance or loan approval.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_SACCO_SERVICES_OFFERED`, `Q_PHYSICAL_LOCATIONS_COUNT`, `Q_OPERATING_HOURS_TEXT`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Sacco membership or service enquiry](../templates/sacco_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Provider and service identity, Supported service or product types; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.

## Business Services

Existing identity: `business_services`. Effective profile: `MP_business_services`.

Define the actual provider/professional task, documents needed through private intake and fee/appointment versus enquiry scope.

Existing onboarding context: `Q_REGULATORY_LICENSE`, `Q_BIZ_SERVICES_OFFERED`, `Q_PHYSICAL_LOCATIONS_COUNT`, `Q_DIGITAL_PLATFORM`. These business/activity answers do not silently fill item or variant facts.

| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |
| --- | --- | --- |
| [Business professional service enquiry](../templates/business_enquiry.md) | Provider and service identity; Service purpose and supported channels; Provider-approved fees, rates and eligibility reference; Application, quote or provider handoff process; Supported service or product types; Locations, currencies or corridor limits; Exact provider service or product name; Authoritative terms and effective time; Private application information route | Card highlights: Supported service or product types; Selected price and itemized charges: Provider-approved fees, rates and eligibility reference, How the price is calculated, Published price or quote status, Included and additional charges; Delivery, pickup, visit or access information: Applicable branches or channels, Application, quote or provider handoff process; Supported date, time, duration and capacity selection: Available dates, times or capacity, How acceptance works, Lead time, buffers and booking horizon; Applicable terms before commitment: Provider-approved fees, rates and eligibility reference, Application, quote or provider handoff process, Included and additional charges, How acceptance works, Lead time, buffers and booking horizon, Authoritative terms and effective time; Private customer order, booking or enquiry input: Requested work and preferences, Relevant location, dates and quantities, Customer contact for this request, Private application information route |

Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.
