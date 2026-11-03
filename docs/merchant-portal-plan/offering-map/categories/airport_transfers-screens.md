# Airport Transfers: product information, screens and workflows

Status: composed design for the complete category. Use the actual selected offering kind; these are not separate per-category backends or new workflow engines.

[All 21 category designs](../all-screens-and-workflows.md) / [Offering field map](airport_transfers.md) / [Workflow information contracts](../workflow-information.md)

## Subcategory coverage

- Airport Pickup: Airport pickup or drop-off trip; Airport meet-and-greet only.
- Airport Drop-off: Airport pickup or drop-off trip.
- Meet & Greet: Airport meet-and-greet only; Airport pickup or drop-off trip.
- Executive Transfer: Executive transfer trip; Airport meet-and-greet only.

## Work

Show the actual accepted offering and selected variants/options, quantity/unit and specification/price/policy versions. Render the existing selected workflow's permitted stages and commands. Private intake is restricted to its purpose and role; never show it in public product data.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Greeting area, escort scope and assistance; Included waiting and extra-time policy; Meeting-sign options; How the price is calculated; Published price or quote status; Included and additional charges; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details |
| [Executive transfer trip](../templates/executive_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |

Required scenario: A later listing/specification edit leaves accepted work unchanged. Product orders, appointments, rentals, custom production, quotes, memberships, freight and storage retain their own workflow and independent payment/allocation/sync states.

## Offerings

Choose the actual product/service kind, then compose the shared, type-specific and conditional input groups. Capture typed values, units, real variants, option compatibility, source and scope. Preview every customer destination before publishing through the existing owner gates.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Greeting area, escort scope and assistance; Included waiting and extra-time policy; Meeting-sign options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details |
| [Executive transfer trip](../templates/executive_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |

Required scenario: Each mapped offering exposes its actual field matrix. Irrelevant construction fields are omitted; type changes review incompatible values; import preserves IDs, data quality and private/public boundaries.

## Availability

Show the applicable availability model for the selected offering: stock by variant/location, exact resource/interval, dated places, compatible spaces, paired windows, accepted workload, redemption or nonblocking request. Unit, time basis, source freshness and confirmation authority stay explicit.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Applicable branches or channels; Vehicle class, seats and luggage; Meeting point and flight-delay policy; Child seats and accessibility options; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Guaranteed amenities and extras |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Applicable branches or channels; Meeting-sign options; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon |
| [Executive transfer trip](../templates/executive_transfer.md) | Applicable branches or channels; Vehicle class, seats and luggage; Meeting point and flight-delay policy; Child seats and accessibility options; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Guaranteed amenities and extras |

Required scenario: Unknown stock/capacity cannot become available. A product purchase does not reserve an appointment, a plan does not reserve its sessions, and an unaccepted request does not block capacity. Selected options recheck all actual constraints.

## Business

Maintain shared identity, permitted activities/locations, applicable policy/verification references and explicitly reusable specification defaults. Item and variant overrides retain their own scope/version. Business category suggests forms but does not describe or restrict the entire catalogue.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Meeting point and flight-delay policy |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Use the actual selected workflow and its existing owner/source references; no irrelevant product inputs are invented. |
| [Executive transfer trip](../templates/executive_transfer.md) | Meeting point and flight-delay policy |

Required scenario: A shared chart, policy or default change previews the affected offerings and preserves explicit overrides and accepted historical facts. A seller declaration never creates a verified badge or provider authority.

## Money

Use the accepted actual item/variant/option, quantity/unit or interval and versioned price/charge terms. Distinguish starting estimates, quote-only, deposits, recurring consent and final total. Payment, refund, settlement and payout facts remain with their separate owners.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Waiting, parking, tolls and extra stops; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Included waiting and extra-time policy; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version |
| [Executive transfer trip](../templates/executive_transfer.md) | Waiting, parking, tolls and extra stops; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version |

Required scenario: A listing edit does not rewrite an accepted price. Per-unit, time, person, pack, carrier and storage bases retain their units and approved calculations; neither a paid amount nor a successful form proves service confirmation.

## Promotions

Select actual eligible published offerings, variants, options, dates and locations. Use accurate specification highlights, correct media, price basis and applicable stock/capacity/policy eligibility. Promotion configuration cannot grant permission or invent availability.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Offering name; Short description; Photos or relevant media; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; How acceptance works; Lead time, buffers and booking horizon; Guaranteed amenities and extras |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Offering name; Short description; Photos or relevant media; Greeting area, escort scope and assistance; Included waiting and extra-time policy; Meeting-sign options; How the price is calculated; Published price or quote status; Included and additional charges; How acceptance works; Lead time, buffers and booking horizon |
| [Executive transfer trip](../templates/executive_transfer.md) | Offering name; Short description; Photos or relevant media; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; How acceptance works; Lead time, buffers and booking horizon; Guaranteed amenities and extras |

Required scenario: A promoted variant has its own eligible price/image/availability. Required product restrictions and source failures remain visible; private customer information is excluded from public promotion content.

## Insights

Report confirmed actual offering/type/variant, location, unit and selected workflow dimensions where evidence exists. Use existing metric definitions and declared source coverage. Catalogue attributes do not create clinical, financial or personal suitability conclusions.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Specific offering type; Applicable branches or channels; Child seats and accessibility options; How the price is calculated; How acceptance works |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Specific offering type; Applicable branches or channels; How the price is calculated; How acceptance works |
| [Executive transfer trip](../templates/executive_transfer.md) | Specific offering type; Applicable branches or channels; Child seats and accessibility options; How the price is calculated; How acceptance works |

Required scenario: Missing quantity, variant, capacity, reason or provider data remains unavailable. Product sales, booked places, accepted production, requests and entitlements do not share an invented universal conversion or completion metric.

## Settings

Configure source/edit authority per fact, typed field/import mappings, units and shared versions. Preserve scoped permissions, conflicts and privacy. The approved 21 additions are explicit design extensions; candidate metadata never silently activates live behavior.

| Actual offering | Relevant information for this screen |
| --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Greeting area, escort scope and assistance; Included waiting and extra-time policy; Meeting-sign options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details |
| [Executive transfer trip](../templates/executive_transfer.md) | Offering name; Short description; Photos or relevant media; Specific offering type; Applicable branches or channels; Content source and external identity; Airports, origin/destination zones and route basis; Vehicle class, seats and luggage; Waiting, parking, tolls and extra stops; Meeting point and flight-delay policy; Child seats and accessibility options; How the price is calculated; Published price or quote status; Included and additional charges; Price and policy version; Available dates, times or capacity; How acceptance works; Lead time, buffers and booking horizon; Chosen pickup and destination; Travel or rental start/end; Passengers, luggage and extras; Flight and passenger details; Vehicle make and model; Model year or declared vehicle age information; Body style and doors; Guaranteed amenities and extras |

Required scenario: An import maps exact product attributes and actual variants with source provenance. Unknown values are not inferred from descriptions; external price/stock/resource facts remain owner-managed and private intake remains restricted.

## Customer screens and the selected workflow

| Offering | Applicable customer surfaces | Registered model/workflow illustrations |
| --- | --- | --- |
| [Airport pickup or drop-off trip](../templates/airport_transfer.md) | Browse and search; Offering detail and specifications; Variant, option and quantity selection; Price and charge breakdown; Delivery, collection or service location; Date, time or capacity selection; Terms and eligibility; Private order, booking or enquiry input; Review and confirmation; Order, booking or request progress | TRANSFER: WF_TRANSFER |
| [Airport meet-and-greet only](../templates/airport_greeting.md) | Browse and search; Offering detail and specifications; Variant, option and quantity selection; Price and charge breakdown; Delivery, collection or service location; Date, time or capacity selection; Terms and eligibility; Private order, booking or enquiry input; Review and confirmation; Order, booking or request progress | TRANSFER: WF_TRANSFER |
| [Executive transfer trip](../templates/executive_transfer.md) | Browse and search; Offering detail and specifications; Variant, option and quantity selection; Price and charge breakdown; Delivery, collection or service location; Date, time or capacity selection; Terms and eligibility; Private order, booking or enquiry input; Review and confirmation; Order, booking or request progress | TRANSFER: WF_TRANSFER |

Actual specialty/method routing uses the preserved existing or approved per-offering workflow references in the JSON; a general model illustration does not replace a regulated, remote, greeting or other specialty variant. Each full template matrix names every merchant field, requirement, scope and exact customer destination.

## Readiness and historical facts

A complete draft is distinct from approved publication, current stock/capacity and a confirmed transaction. Keep actual variant/option relationships, typed units, source ownership and private intake. Accepted work retains its specification, price and policy versions even when the current catalogue changes.
